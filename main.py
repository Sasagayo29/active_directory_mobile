from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta
import subprocess
import json
from ldap3 import Server, Connection, ALL, NTLM, SUBTREE

app = FastAPI(title="KAD Mobile API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURAÇÕES DE SEGURANÇA E DOMÍNIO ---
SECRET_KEY = "uma-chave-super-secreta-kinross" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120 

AD_SERVER = '10.205.200.43' 
AD_SEARCH_BASE = 'DC=KinrossGold,DC=com'

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- MODELOS ---
class PasswordReset(BaseModel):
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

# --- JWT: AGORA CARREGA AS CREDENCIAIS ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_credentials(token: str = Depends(oauth2_scheme)):
    """Extrai o usuário e a senha do token para usar nas conexões LDAP e PowerShell."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sessão expirada ou inválida",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        password: str = payload.get("pwd")
        if username is None or password is None:
            raise credentials_exception
        return {"username": username, "password": password}
    except JWTError:
        raise credentials_exception

def search_ad_ldap(search_term: str, creds: dict):
    server = Server(AD_SERVER, get_info=ALL)
    full_username = f"{creds['username']}@kinrossgold.com"
    
    try:
        conn = Connection(server, user=full_username, password=creds['password'], auto_bind=True)
        
        # Filtro de Busca Inteligente: Asteriscos no início e no fim para achar qualquer parte
        ldap_filter = (
            f"(|"
            f"(sAMAccountName=*{search_term}*)"
            f"(displayName=*{search_term}*)"
            f"(mail=*{search_term}*)"
            f"(employeeID=*{search_term}*)"
            f"(cn=*{search_term}*)"
            f")"
        )
        
        # Solicitando mais atributos (OS e Descrição)
        conn.search(
            AD_SEARCH_BASE, 
            ldap_filter, 
            search_scope=SUBTREE, 
            attributes=['sAMAccountName', 'displayName', 'mail', 'employeeID', 'userAccountControl', 'lockoutTime', 'objectClass', 'description', 'operatingSystem']
        )
        
        if not conn.entries:
            return None
            
        entry = conn.entries[0]
        
        # 1. Identificando o Tipo de Objeto (User, Computer ou Group)
        obj_classes = [c.lower() for c in entry.objectClass.values] if entry.objectClass else []
        if "computer" in obj_classes:
            obj_type = "Computer"
        elif "group" in obj_classes:
            obj_type = "Group"
        else:
            obj_type = "User"
        
        # 2. Tratando status e bloqueio
        uac = entry.userAccountControl.value if entry.userAccountControl else 0
        is_enabled = not bool(uac & 2) 
        
        is_locked = False
        if entry.lockoutTime:
            lockout_val = entry.lockoutTime.value
            is_locked = hasattr(lockout_val, 'year') and lockout_val.year > 1601 
            
        # 3. Puxando dados extras
        desc = entry.description.value if entry.description else None
        os_name = entry.operatingSystem.value if 'operatingSystem' in entry and entry.operatingSystem else None

        return {
            "SamAccountName": entry.sAMAccountName.value if entry.sAMAccountName else "N/A",
            "DisplayName": entry.displayName.value if entry.displayName else entry.sAMAccountName.value,
            "EmailAddress": entry.mail.value if entry.mail else None,
            "EmployeeID": entry.employeeID.value if entry.employeeID else None,
            "Description": str(desc) if desc else None,
            "OS": str(os_name) if os_name else None,
            "Enabled": is_enabled,
            "LockedOut": is_locked,
            "Type": obj_type
        }
        
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Falha de Autenticação no AD: Verifique as credenciais. Erro: {str(e)}")
    finally:
        if 'conn' in locals() and conn:
            conn.unbind()

# --- MOTOR POWERSHELL DINÂMICO ---
def run_powershell(command: str, creds: dict):
    """Executa o PowerShell injetando o PSCredential dinamicamente para auditoria."""
    
    # Cria um objeto PSCredential invisível usando o usuário e senha do Token
    auth_prefix = (
        f"$secpasswd = ConvertTo-SecureString '{creds['password']}' -AsPlainText -Force; "
        f"$mycreds = New-Object System.Management.Automation.PSCredential ('KinrossGold\\{creds['username']}', $secpasswd); "
    )
    
    # Acrescenta o -Credential a todos os comandos do script
    full_command = f"{auth_prefix} {command} | ConvertTo-Json -Compress"
    
    try:
        result = subprocess.run(
            ["powershell", "-Command", full_command],
            capture_output=True, text=True, check=True
        )
        if not result.stdout.strip():
            return {"status": "success", "message": "Comando executado com sucesso."}
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"Erro no AD: {e.stderr.strip()}")

# --- ENDPOINTS ---

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """Tenta logar contra o Active Directory real. Se passar, gera o Token."""
    
    server = Server(AD_SERVER, get_info=ALL)
    
    # FORMATO UPN (User Principal Name): O padrão mais aceito pelos DCs modernos
    # Em vez de KinrossGold\RiqBorges, usamos RiqBorges@kinrossgold.com
    full_username = f"{form_data.username}@kinrossgold.com"
    
    try:
        # Usamos o auto_bind=True e removemos o NTLM para forçar um Bind Simples,
        # que funciona muito melhor com o formato UPN no ldap3.
        conn = Connection(server, user=full_username, password=form_data.password, auto_bind=True)
        conn.unbind()
        
        # Se chegou aqui, a senha do AD está correta! Embutimos ela no token.
        access_token = create_access_token(data={"sub": form_data.username, "pwd": form_data.password})
        return {"access_token": access_token, "token_type": "bearer"}
        
    except Exception as e:
        # Imprime o erro no console do Uvicorn para vermos exatamente o que o AD reclamou
        print(f"Erro de login LDAP: {e}")
        raise HTTPException(status_code=401, detail="Usuário ou senha do AD incorretos.")


@app.get("/users/{search_term}")
def get_user(search_term: str, creds: dict = Depends(get_current_credentials)):
    """A busca agora exige que o PWA mande um Token válido, senão o LDAP não conecta."""
    data = search_ad_ldap(search_term, creds)
    
    if not data:
        raise HTTPException(status_code=404, detail="Nenhum registro encontrado no AD.")
        
    return {"data": data}


@app.post("/users/{username}/unlock")
def unlock_user(username: str, creds: dict = Depends(get_current_credentials)):
    # Usamos a variável $mycreds que foi criada na função run_powershell
    script = f"Unlock-ADAccount -Identity '{username}' -Credential $mycreds"
    run_powershell(script, creds)
    return {"message": f"Usuário {username} desbloqueado."}


@app.post("/users/{username}/reset-password")
def reset_password(username: str, payload: PasswordReset, creds: dict = Depends(get_current_credentials)):
    script = (
        f"$Password = ConvertTo-SecureString -String '{payload.new_password}' -AsPlainText -Force; "
        f"Set-ADAccountPassword -Identity '{username}' -NewPassword $Password -Reset -Credential $mycreds; "
        f"Set-ADUser -Identity '{username}' -ChangePasswordAtLogon $true -Credential $mycreds"
    )
    run_powershell(script, creds)
    return {"message": f"Senha de {username} redefinida."}