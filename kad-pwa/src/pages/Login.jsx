import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';
import { Lock, User, Server, Globe, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(''); // Deixe vazio para ativar o Auto-Discovery
  const [domain, setDomain] = useState('kinrossgold.com');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [hasBiometric, setHasBiometric] = useState(false);
  const [isBiometricRegistered, setIsBiometricRegistered] = useState(false);

  React.useEffect(() => {
    // Verifica se o navegador suporta WebAuthn e se já temos um token salvo
    if (window.PublicKeyCredential) {
      setHasBiometric(true);
      if (localStorage.getItem('@kad_biometria_cadastrada') === 'true' && localStorage.getItem('@kad_token')) {
        setIsBiometricRegistered(true);
      }
    }
  }, []);

  // 1. CADASTRAR A BIOMETRIA NO CELULAR (Primeiro Acesso)
  const handleRegisterBiometric = async () => {
    try {
      const publicKey = {
        challenge: window.crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: "KAD Mobile"
          // Omitimos rp.id para o navegador tentar assumir a origem atual automaticamente
        },
        user: {
          id: window.crypto.getRandomValues(new Uint8Array(16)),
          name: username || "usuario_kad",
          displayName: username || "Analista KAD"
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000
      };

      await navigator.credentials.create({ publicKey });
      localStorage.setItem('@kad_biometria_cadastrada', 'true');
      setIsBiometricRegistered(true);
      toast.success("Biometria cadastrada com sucesso neste celular!");
    } catch (err) {
      toast.error("Erro no cadastro: Navegadores bloqueiam biometria em endereços IP numéricos (use um domínio DNS).");
    }
  };

  // 2. DESBLOQUEAR COM A BIOMETRIA CADASTRADA (Acessos Seguintes)
  const handleBiometricUnlock = async () => {
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: window.crypto.getRandomValues(new Uint8Array(32)),
          userVerification: "required",
          timeout: 60000
        }
      });

      if (credential) {
        toast.success("Identidade biométrica confirmada!");
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error("Leitura cancelada ou falha na validação biométrica.");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      return toast.error('Preencha o usuário e a senha de rede.');
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('server', server || 'AUTO'); // Se estiver vazio, manda a palavra AUTO
    formData.append('domain', domain);

    try {
      const response = await api.post('/token', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      localStorage.setItem('@kad_token', response.data.access_token);
      toast.success('Autenticado com sucesso!');
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err) {
      // Se tiver resposta do Python, mostra normal. Se não, mostra o erro do celular e para onde ele tentou ir.
      if (err.response) {
        toast.error(err.response?.data?.detail || 'Falha na autenticação.');
      } else {
        toast.error(`Bloqueio Mobile: ${err.message}. Destino: ${err.config?.baseURL}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <Toaster position="top-right" toastOptions={{ style: { background: COLORS.cell, color: COLORS.text, border: `1px solid ${COLORS.border}`, fontSize: '13px' } }} />
      
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>K</div>
          <h2 style={styles.title}>KAD Mobile</h2>
          <p style={styles.subtitle}>Console Corporativo Active Directory</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><Server size={16} /></span>
            <input 
              type="text" 
              placeholder="Serve DC (Em branco = Auto)" 
              value={server} 
              onChange={(e) => setServer(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><Globe size={16} /></span>
            <input 
              type="text" 
              placeholder="Domínio" 
              value={domain} 
              onChange={(e) => setDomain(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><User size={16} /></span>
            <input 
              type="text" 
              placeholder="Usuário de Rede (Login)" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <div style={styles.inputGroup}>
            <span style={styles.iconSpan}><Lock size={16} /></span>
            <input 
              type="password" 
              placeholder="Senha" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              style={styles.input} 
            />
          </div>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? <div style={styles.spinner}></div> : <>Conectar ao Domínio <ArrowRight size={16} /></>}
          </button>

          {/* BOTÕES INTELIGENTES DE BIOMETRIA */}
          {hasBiometric && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
              {/* Se já tiver biometria cadastrada e token salvo, exibe Entrar Direto */}
              {isBiometricRegistered ? (
                <button
                  type="button"
                  onClick={handleBiometricUnlock}
                  style={styles.biometricBtn}
                >
                  👆 Entrar com Biometria / Face ID
                </button>
              ) : (
                /* Se ainda não cadastrou, exibe botão para cadastrar após logar */
                <button
                  type="button"
                  onClick={handleRegisterBiometric}
                  style={{ ...styles.biometricBtn, borderColor: COLORS.muted, color: COLORS.muted }}
                  title="Cadastre sua digital após fazer o primeiro login"
                >
                  🛡️ Cadastrar Biometria neste Celular
                </button>
              )}

            </div>
          )}

        </form>

        <div style={styles.footer}>
          <ShieldCheck size={14} color={COLORS.success} /> <span>Ambiente Seguro LDAPS</span>
        </div>
      </div>
    </div>
  );
}

const COLORS = { 
  bg: '#0B111E', 
  frame: '#161F32', 
  cell: '#121824', 
  border: '#24324D', 
  gold: '#C5A059', 
  text: '#F8FAFC', 
  muted: '#94A3B8', 
  success: '#10B981', 
  danger: '#EF4444' 
};

const styles = {
  container: { backgroundColor: COLORS.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, sans-serif', padding: '20px' },
  card: { backgroundColor: COLORS.frame, borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '400px', border: `1px solid ${COLORS.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },
  header: { textAlign: 'center', marginBottom: '25px' },
  logoBadge: { backgroundColor: COLORS.gold, color: COLORS.bg, width: '42px', height: '42px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '20px', margin: '0 auto 12px auto' },
  title: { color: COLORS.gold, margin: '0 0 5px 0', fontSize: '20px', fontWeight: 'bold' },
  subtitle: { color: COLORS.muted, margin: 0, fontSize: '12px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  inputGroup: { display: 'flex', alignItems: 'center', backgroundColor: COLORS.cell, borderRadius: '6px', border: `1px solid ${COLORS.border}`, padding: '0 12px' },
  iconSpan: { color: COLORS.muted, display: 'flex', alignItems: 'center', marginRight: '10px' },
  input: { flex: 1, backgroundColor: 'transparent', border: 'none', color: COLORS.text, fontSize: '14px', padding: '12px 0', outline: 'none' },
  submitBtn: { backgroundColor: COLORS.gold, color: COLORS.bg, border: 'none', borderRadius: '6px', padding: '12px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px' },
  spinner: { width: '18px', height: '18px', border: `2px solid rgba(0,0,0,0.2)`, borderTop: `2px solid ${COLORS.bg}`, borderRadius: '50%', animation: 'spin 1s linear infinite' },
  biometricBtn: {
    width: '100%',
    padding: '12px',
    backgroundColor: 'transparent',
    border: `1px solid ${COLORS.gold}`,
    color: COLORS.gold,
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '13px'
  },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px', color: COLORS.muted, fontSize: '11px' }
};