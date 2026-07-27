import os
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta
import subprocess
import json
import pyodbc
import ldap3 # Certifique-se de que isso está no topo do seu main.py
from ldap3 import Server, Connection, ALL, SUBTREE

app = FastAPI(title="KAD Mobile API - Módulo Avançado AD com Auditoria")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURAÇÃO DO AUDIT LOGGER ---
class AuditLogger:
    @staticmethod
    def log(operador: str, acao: str, alvo: str, status: str):
        try:
            # O arquivo será criado na mesma pasta onde a API estiver rodando
            log_file = "KAD_Audit.log" 
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            linha_log = f"[{timestamp}] | Operador: {operador} | Acao: {acao} | Alvo: {alvo} | Status: {status}\n"
            
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(linha_log)
        except Exception as e:
            print(f"Erro ao gravar log de auditoria: {e}")

# --- CONFIGURAÇÕES DE SEGURANÇA E DOMÍNIO ---
SECRET_KEY = "uma-chave-super-secreta-kinross" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120 

AD_SERVER = '10.205.200.43' 
AD_SEARCH_BASE = 'DC=KinrossGold,DC=com'

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- MODELOS DE DADOS ---
class PasswordReset(BaseModel):
    new_password: str
    force_change: bool = True
    unlock_account: bool = False

class ProfileEdit(BaseModel):
    title: str = ""
    department: str = ""
    telephone: str = ""

class MoveObject(BaseModel):
    new_ou: str

class BulkAction(BaseModel):
    usernames: list[str]

class Token(BaseModel):
    access_token: str
    token_type: str

# --- JWT & AUTENTICAÇÃO ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_credentials(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sessão expirada ou inválida",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        password: str = payload.get("pwd")
        if not username or not password:
            raise credentials_exception
        return {"username": username, "password": password}
    except JWTError:
        raise credentials_exception

def get_ldap_connection(creds: dict):
    server = Server(AD_SERVER, get_info=ALL)
    full_username = f"{creds['username']}@kinrossgold.com"
    try:
        conn = Connection(server, user=full_username, password=creds['password'], auto_bind=True)
        return conn
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Erro de autenticação no AD: {str(e)}")

# --- MOTOR DE POWERSHELL DINÂMICO ---
def run_powershell(command: str, creds: dict, return_json: bool = True):
    # 1. Quebra a 'bolha' da API e puxa as variáveis globais da máquina root
    # 2. Força a importação do módulo AD parando o script imediatamente se falhar
    auth_prefix = (
        f"$env:PSModulePath = [System.Environment]::GetEnvironmentVariable('PSModulePath', 'Machine'); "
        f"Import-Module ActiveDirectory -ErrorAction Stop; "
        f"$secpasswd = ConvertTo-SecureString '{creds['password']}' -AsPlainText -Force; "
        f"$mycreds = New-Object System.Management.Automation.PSCredential ('KinrossGold\\{creds['username']}', $secpasswd); "
    )
    
    suffix = " | ConvertTo-Json -Compress -Depth 5" if return_json else ""
    full_command = f"{auth_prefix} {command} {suffix}"
    
    # 3. Garante execução em 64-bits mesmo se o Python da API for 32-bits
    ps_exec = r"C:\Windows\sysnative\WindowsPowerShell\v1.0\powershell.exe"
    if not os.path.exists(ps_exec):
        ps_exec = "powershell.exe"
        
    try:
        result = subprocess.run(
            [ps_exec, "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", full_command],
            capture_output=True, text=True, encoding='cp850', errors='replace'
        )
        
        if result.returncode != 0:
            erro_real = result.stderr.strip() if result.stderr else result.stdout.strip()
            raise HTTPException(status_code=400, detail=f"Erro no WinRM/AD: {erro_real}")
            
        stdout_str = result.stdout.strip()
        
        if not return_json or not stdout_str:
            return {"status": "success", "message": stdout_str or "Executado com sucesso."}
            
        try:
            return json.loads(stdout_str)
        except json.JSONDecodeError:
            return stdout_str 
            
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"Falha de execução do Processo: {str(e)}")
    
# --- ENDPOINTS BÁSICOS E BUSCA ---

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    creds = {"username": form_data.username, "password": form_data.password}
    conn = get_ldap_connection(creds)
    conn.unbind()
    access_token = create_access_token(data={"sub": form_data.username, "pwd": form_data.password})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/{search_term}")
def get_user(search_term: str, creds: dict = Depends(get_current_credentials)):
    conn = get_ldap_connection(creds)
    try:
        ldap_filter = (
            f"(|"
            f"(sAMAccountName=*{search_term}*)"
            f"(displayName=*{search_term}*)"
            f"(mail=*{search_term}*)"
            f"(employeeID=*{search_term}*)"
            f"(pager=*{search_term}*)"
            f"(cn=*{search_term}*)"
            f")"
        )
        
        conn.search(
            AD_SEARCH_BASE, 
            ldap_filter, 
            search_scope=SUBTREE, 
            attributes=[
                'sAMAccountName', 'displayName', 'mail', 'employeeID', 'pager', 
                'userAccountControl', 'lockoutTime', 'objectClass', 
                'description', 'operatingSystem', 'title', 'department', 
                'telephoneNumber', 'company', 'physicalDeliveryOfficeName', 'distinguishedName',
                'memberOf', 'member'
            ]
        )
        
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Objeto não encontrado.")
            
        results = []
        
        # Iterando sobre todos os resultados retornados pelo AD
        for entry in conn.entries:
            obj_classes = [c.lower() for c in entry.objectClass.values] if entry.objectClass else []
            if "computer" in obj_classes:
                obj_type = "Computer"
            elif "group" in obj_classes:
                obj_type = "Group"
            else:
                obj_type = "User"
            
            uac = entry.userAccountControl.value if entry.userAccountControl else 0
            is_enabled = not bool(uac & 2) 
            is_locked = bool(entry.lockoutTime and hasattr(entry.lockoutTime.value, 'year') and entry.lockoutTime.value.year > 1601)
            
            matricula = None
            if 'pager' in entry and entry.pager:
                matricula = entry.pager.value
            elif 'employeeID' in entry and entry.employeeID:
                matricula = entry.employeeID.value

            grupos = []
            if 'memberOf' in entry and entry.memberOf:
                for g in entry.memberOf.values:
                    grupos.append(str(g).split(',')[0].replace('CN=', ''))
            
            membros = []
            if 'member' in entry and entry.member:
                for m in entry.member.values:
                    membros.append(str(m).split(',')[0].replace('CN=', ''))

            results.append({
                "SamAccountName": entry.sAMAccountName.value if 'sAMAccountName' in entry and entry.sAMAccountName else "N/A",
                "DisplayName": entry.displayName.value if 'displayName' in entry and entry.displayName else (entry.sAMAccountName.value if 'sAMAccountName' in entry else "N/A"),
                "EmailAddress": entry.mail.value if 'mail' in entry and entry.mail else None,
                "EmployeeID": matricula,
                "Title": entry.title.value if 'title' in entry and entry.title else None,
                "Department": entry.department.value if 'department' in entry and entry.department else None,
                "TelephoneNumber": entry.telephoneNumber.value if 'telephoneNumber' in entry and entry.telephoneNumber else None,
                "Company": entry.company.value if 'company' in entry and entry.company else None,
                "Office": entry.physicalDeliveryOfficeName.value if 'physicalDeliveryOfficeName' in entry and entry.physicalDeliveryOfficeName else None,
                "Description": entry.description.value if 'description' in entry and entry.description else None,
                "OS": entry.operatingSystem.value if 'operatingSystem' in entry and entry.operatingSystem else None,
                "DN": entry.distinguishedName.value if 'distinguishedName' in entry else "",
                "Enabled": is_enabled,
                "LockedOut": is_locked,
                "UserAccountControl": uac,
                "Type": obj_type,
                "MemberOf": sorted(grupos),
                "Members": sorted(membros)
            })

        return {"data": results}
    finally:
        conn.unbind()

# --- AÇÕES DE CONTA E EDIÇÃO DE PERFIL ---

@app.post("/users/{username}/toggle-status")
def toggle_account_status(username: str, creds: dict = Depends(get_current_credentials)):
    conn = get_ldap_connection(creds)
    try:
        # Busca o objeto (Usuário ou Computador) e seu atributo de controle
        conn.search(AD_SEARCH_BASE, f"(sAMAccountName={username})", attributes=['userAccountControl'])
        
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Objeto não encontrado no AD.")
            
        entry = conn.entries[0]
        uac = entry.userAccountControl.value if 'userAccountControl' in entry else 512
        
        # Matemática Binária (Bitwise): 
        # O bit '2' representa a conta desativada no Windows.
        is_disabled = bool(uac & 2)
        new_uac = (uac & ~2) if is_disabled else (uac | 2)
        
        # Modifica instantaneamente via rede (dispensa totalmente o PowerShell)
        success = conn.modify(entry.entry_dn, {'userAccountControl': [(ldap3.MODIFY_REPLACE, [new_uac])]})
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Bloqueado pelo AD: {conn.result['description']}")
            
        AuditLogger.log(creds["username"], "AlternarStatus", username, "SUCESSO")
        return {"message": "Status alterado com sucesso."}
    finally:
        conn.unbind()

@app.post("/users/{username}/edit-profile")
def edit_profile(username: str, payload: ProfileEdit, creds: dict = Depends(get_current_credentials)):
    script = (
        f"Set-ADUser -Identity '{username}' "
        f"-Title '{payload.title}' "
        f"-Department '{payload.department}' "
        f"-OfficePhone '{payload.telephone}' "
        f"-Credential $mycreds"
    )
    run_powershell(script, creds)
    AuditLogger.log(creds["username"], "EditarPerfil", username, "SUCESSO")
    return {"message": "Perfil editado com sucesso."}

@app.post("/users/{username}/unlock")
def unlock_user(username: str, creds: dict = Depends(get_current_credentials)):
    script = f"Unlock-ADAccount -Identity '{username}' -Credential $mycreds"
    run_powershell(script, creds)
    AuditLogger.log(creds["username"], "Desbloquear", username, "SUCESSO")
    return {"message": f"Usuário {username} desbloqueado."}

@app.post("/users/{username}/reset-password")
def reset_password(username: str, payload: PasswordReset, creds: dict = Depends(get_current_credentials)):
    script = (
        f"$Password = ConvertTo-SecureString -String '{payload.new_password}' -AsPlainText -Force; "
        f"Set-ADAccountPassword -Identity '{username}' -NewPassword $Password -Reset -Credential $mycreds; "
    )
    if payload.force_change:
        script += f"Set-ADUser -Identity '{username}' -ChangePasswordAtLogon $true -Credential $mycreds; "
    if payload.unlock_account:
        script += f"Unlock-ADAccount -Identity '{username}' -Credential $mycreds; "
        
    run_powershell(script, creds)
    AuditLogger.log(creds["username"], "ResetSenha", username, "SUCESSO")
    return {"message": f"Senha de {username} redefinida."}

# --- LISTAGEM DE OUs E MOVIMENTAÇÃO DE OBJETOS ---

@app.get("/ous")
def list_ous(creds: dict = Depends(get_current_credentials)):
    conn = get_ldap_connection(creds)
    try:
        conn.search(
            AD_SEARCH_BASE, 
            "(objectClass=organizationalUnit)", 
            search_scope=SUBTREE, 
            attributes=['ou']
        )
        ous = [{"dn": entry.entry_dn, "ou": entry.ou.value if 'ou' in entry else entry.entry_dn} for entry in conn.entries]
        return {"data": ous}
    finally:
        conn.unbind()

@app.post("/users/{username}/move")
def move_object(username: str, payload: MoveObject, creds: dict = Depends(get_current_credentials)):
    script = (
        f"$target = Get-ADObject -Filter \"SamAccountName -eq '{username}'\" -Credential $mycreds; "
        f"Move-ADObject -Identity $target.DistinguishedName -TargetPath '{payload.new_ou}' -Credential $mycreds"
    )
    run_powershell(script, creds)
    AuditLogger.log(creds["username"], "MoverOU", username, f"SUCESSO - Destino: {payload.new_ou}")
    return {"message": "Objeto movido com sucesso."}

# --- OPERAÇÕES EM LOTE (BULK ACTIONS) ---

@app.post("/bulk/{action}")
def bulk_operations(action: str, payload: BulkAction, creds: dict = Depends(get_current_credentials)):
    if action not in ["unlock", "enable", "disable"]:
        raise HTTPException(status_code=400, detail="Ação em lote inválida.")
        
    cmd_map = {
        "unlock": "Unlock-ADAccount",
        "enable": "Enable-ADAccount",
        "disable": "Disable-ADAccount"
    }
    
    ps_cmd = cmd_map[action]
    success_count = 0
    errors = []
    
    for user in payload.usernames:
        try:
            script = f"{ps_cmd} -Identity '{user}' -Credential $mycreds"
            run_powershell(script, creds)
            success_count += 1
            AuditLogger.log(creds["username"], f"Bulk_{action.capitalize()}", user, "SUCESSO")
        except Exception as e:
            errors.append({"user": user, "error": str(e)})
            AuditLogger.log(creds["username"], f"Bulk_{action.capitalize()}", user, f"FALHA: {str(e)}")
            
    return {"success_count": success_count, "total": len(payload.usernames), "errors": errors}

# --- GRUPOS LOCAIS DE MÁQUINAS (WINRM) ---

@app.get("/computers/{hostname}/local-groups")
def get_computer_local_groups(hostname: str, creds: dict = Depends(get_current_credentials)):
    script_block = (
        "$groups = Get-LocalGroup -ErrorAction SilentlyContinue; "
        "if (-not $groups) { return @() }; "
        "$res = @(); "
        "foreach ($g in $groups) { "
        "  $members = Get-LocalGroupMember -Group $g.Name -ErrorAction SilentlyContinue; "
        "  if ($members) { "
        "    foreach ($m in $members) { "
        "      $res += [PSCustomObject]@{ Grupo=$g.Name; Membro=$m.Name; }; "
        "    } "
        "  } "
        "} "
        "$res | ConvertTo-Json -Compress"
    )
    script = f"Invoke-Command -ComputerName '{hostname}' -ScriptBlock {{ {script_block} }} -Credential $mycreds"
    data = run_powershell(script, creds)
    AuditLogger.log(creds["username"], "ConsultarGruposLocais", hostname, "SUCESSO")
    return {"data": data}

import re

# --- MODELOS DE DADOS PARA O COMPARADOR ---
class CompareUsers(BaseModel):
    usernames: list[str]

# --- MÓDULO 6: DIAGNÓSTICOS REMOTOS (PING, WMI, SPLUNK) ---

@app.get("/diagnostics/{target}/{diag_type}")
def run_diagnostics(target: str, diag_type: str, creds: dict = Depends(get_current_credentials)):
    """Executa diagnósticos diretos via PowerShell com captura de terminal."""
    # Validação de segurança básica para evitar injeção de comandos
    if not re.match(r"^[a-zA-Z0-9.-]+$", target):
        raise HTTPException(status_code=400, detail="Alvo inválido.")
        
    if diag_type == "ping":
        script = f"Test-Connection -ComputerName '{target}' -Count 4 -ErrorAction SilentlyContinue | Format-Table Address, IPv4Address, ResponseTime"
    elif diag_type == "wmi":
        script = (
            f"Get-CimInstance Win32_OperatingSystem -ComputerName '{target}' -ErrorAction SilentlyContinue | Select-Object LastBootUpTime | Format-List; "
            f"Get-CimInstance Win32_ComputerSystem -ComputerName '{target}' -ErrorAction SilentlyContinue | Select-Object UserName, TotalPhysicalMemory, Manufacturer, Model | Format-List"
        )
    elif diag_type == "splunk":
        # Rastreia logs de bloqueio (Event ID 4740) no Primary Domain Controller (PDC)
        script = (
            f"$pdc = (Get-ADDomain).PDCEmulator; "
            f"Get-WinEvent -ComputerName $pdc -FilterHashtable @{{LogName='Security'; Id=4740}} -MaxEvents 50 -ErrorAction SilentlyContinue | "
            f"Where-Object {{$_.Properties[0].Value -eq '{target}'}} | Format-List TimeCreated, Message"
        )
    else:
        raise HTTPException(status_code=400, detail="Diagnóstico desconhecido.")
        
    auth_prefix = (
        f"$secpasswd = ConvertTo-SecureString '{creds['password']}' -AsPlainText -Force; "
        f"$mycreds = New-Object System.Management.Automation.PSCredential ('KinrossGold\\{creds['username']}', $secpasswd); "
    )
    full_command = f"{auth_prefix} Invoke-Command -ScriptBlock {{ {script} }} -Credential $mycreds"
    
    try:
        # Usamos cp850 para suportar acentuação padrão do cmd/powershell no Brasil
        result = subprocess.run(["powershell", "-Command", full_command], capture_output=True, text=True, encoding='cp850', errors='replace')
        output = result.stdout.strip()
        
        if not output and diag_type == "splunk":
            output = f"Nenhum evento de bloqueio recente (4740) encontrado para o usuário {target} no PDC."
        elif not output:
            output = "Falha na comunicação. O host pode estar offline ou bloqueando WinRM/ICMP."
            
        AuditLogger.log(creds["username"], f"Diag_{diag_type.upper()}", target, "EXECUTADO")
        return {"output": output}
    except Exception as e:
        return {"output": f"Erro crítico ao executar subprocesso: {str(e)}"}

# --- MÓDULO 7: COMPARADOR HOLÍSTICO DE PERMISSÕES ---

@app.post("/compare")
def compare_users(payload: CompareUsers, creds: dict = Depends(get_current_credentials)):
    """Cruza o MemberOf de múltiplos usuários para gerar o relatório de convergência."""
    conn = get_ldap_connection(creds)
    try:
        users_data = {}
        for u in payload.usernames:
            conn.search(AD_SEARCH_BASE, f"(sAMAccountName={u})", search_scope=SUBTREE, attributes=['sAMAccountName', 'displayName', 'title', 'memberOf'])
            if conn.entries:
                entry = conn.entries[0]
                groups = set(str(g).split(',')[0].replace('CN=', '') for g in entry.memberOf.values) if ('memberOf' in entry and entry.memberOf) else set()
                users_data[u] = {
                    "DisplayName": entry.displayName.value if 'displayName' in entry and entry.displayName else u,
                    "Title": entry.title.value if 'title' in entry and entry.title else "N/A",
                    "Groups": list(groups)
                }

        if not users_data:
            raise HTTPException(status_code=404, detail="Nenhum usuário válido encontrado no AD.")

        # Realiza a interseção matemática de todos os conjuntos de grupos
        all_sets = [set(data["Groups"]) for data in users_data.values()]
        common_groups = set.intersection(*all_sets) if all_sets else set()

        # Calcula a diferença (Grupos Exclusivos) para cada usuário
        for u, data in users_data.items():
            data["ExclusiveGroups"] = sorted(list(set(data["Groups"]) - common_groups))
            del data["Groups"] # Limpa a lista original bruta para economizar payload

        AuditLogger.log(creds["username"], "ComparadorGeral", f"{len(payload.usernames)} usuários", "SUCESSO")
        return {
            "common_groups": sorted(list(common_groups)),
            "users": users_data
        }
    finally:
        conn.unbind()

# --- MÓDULO 8: INTEGRAÇÃO VETORH (SQL SERVER) ---

class VetorhUpdate(BaseModel):
    matriculas: list[str]
    tipcol: int
    techacc: str

def get_db_connection():
    """Lógica inteligente que descobre o Driver SQL instalado na máquina"""
    server = r'PTU-SQL-03\SQLSEN' 
    database = 'DKBMVETORHPD0' 
    
    drivers_instalados = pyodbc.drivers()
    driver_escolhido = '{SQL Server}' # Fallback universal nativo do Windows
    
    if 'ODBC Driver 17 for SQL Server' in drivers_instalados: 
        driver_escolhido = '{ODBC Driver 17 for SQL Server}'
    elif 'ODBC Driver 13 for SQL Server' in drivers_instalados: 
        driver_escolhido = '{ODBC Driver 13 for SQL Server}'
    elif 'SQL Server Native Client 11.0' in drivers_instalados: 
        driver_escolhido = '{SQL Server Native Client 11.0}'

    connection_string = f'DRIVER={driver_escolhido};SERVER={server};DATABASE={database};Trusted_Connection=yes;'
    return pyodbc.connect(connection_string, timeout=10)

@app.get("/vetorh/{matricula}")
def get_vetorh_access(matricula: str, creds: dict = Depends(get_current_credentials)):
    """Consulta o acesso técnico do colaborador no Vetorh."""
    try:
        mat_int = int(matricula)
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = "SELECT usu_techacc, numcad, tipcol FROM vetorh.r034cpl WHERE numcad = ?"
        cursor.execute(query, mat_int)
        row = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if row:
            return {"techacc": str(row[0]).strip(), "tipcol": int(row[2])}
        return {"techacc": "NTU", "tipcol": 1, "message": "Sem Acesso (Vazio)"}
    except Exception as e:
        return {"techacc": "NTU", "tipcol": 1, "error": f"Erro DB: {str(e)}"}

@app.post("/vetorh/update")
def update_vetorh_access(payload: VetorhUpdate, creds: dict = Depends(get_current_credentials)):
    """Atualiza a procedure de acesso no banco de dados (Unitário ou Lote)."""
    sucessos = 0
    erros = []
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        for mat in payload.matriculas:
            try:
                mat_int = int(mat)
                query = "{CALL vetorh.SP_IntTITechAcc (?, ?, ?)}"
                cursor.execute(query, (payload.tipcol, mat_int, payload.techacc))
                conn.commit()
                sucessos += 1
                AuditLogger.log(creds["username"], "UpdateVetorh", str(mat_int), f"SUCESSO: {payload.techacc}")
            except Exception as e:
                erros.append({"matricula": mat, "error": str(e)})
                
        cursor.close()
        conn.close()
        return {"success_count": sucessos, "errors": erros}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha de conexão com o Banco: {str(e)}")

# --- MÓDULO 9: GESTÃO DE IMPRESSORAS (WINRM) ---

def formatar_fqdn(servidor: str) -> str:
    if "." not in servidor and not servidor.replace(".", "").isdigit():
        return f"{servidor}.kinrossgold.com"
    return servidor

@app.get("/printers/{server}")
def list_printers(server: str, filter: str = "*", creds: dict = Depends(get_current_credentials)):
    """Mapeia as filas de impressão de um Print Server remoto."""
    fqdn = formatar_fqdn(server)
    termo = f"*{filter}*" if filter != "*" else "*"
    
    # Correção: O bloco de script agora fecha as chaves sem duplicações indesejadas do Python
    script_block = (
        f"@(Get-Printer -Name '{termo}' -ErrorAction SilentlyContinue | ForEach-Object {{ "
        "[PSCustomObject]@{ "
        "Name=[string]$_.Name; "
        "PrinterStatus=[string]$_.PrinterStatus; "
        "JobCount=[int]$_.JobCount; "
        "PortName=[string]$_.PortName; "
        "Location=[string]$_.Location; "
        "DriverName=[string]$_.DriverName "
        "} } )"
    )
    script = f"Invoke-Command -ComputerName '{fqdn}' -ScriptBlock {{ {script_block} }} -Credential $mycreds"
    
    data = run_powershell(script, creds, return_json=True)
    return {"data": data}