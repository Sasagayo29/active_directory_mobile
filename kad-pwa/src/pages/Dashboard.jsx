import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [userResult, setUserResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('@kad_token');
    navigate('/');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError('');
    setUserResult(null);
    setNewPassword('');

    try {
      const response = await api.get(`/users/${searchTerm}`);
      setUserResult(response.data.data);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        setError('Nenhum resultado encontrado no AD.');
      } else {
        setError('Erro de conexão com o servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!userResult) return;
    try {
      await api.post(`/users/${userResult.SamAccountName}/unlock`);
      alert(`Conta desbloqueada com sucesso!`);
      handleSearch(new Event('submit'));
    } catch (err) {
      alert('Erro ao tentar desbloquear a conta.');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      alert('A senha temporária deve ter pelo menos 8 caracteres.');
      return;
    }
    setResetLoading(true);
    try {
      await api.post(`/users/${userResult.SamAccountName}/reset-password`, {
        new_password: newPassword
      });
      alert(`Senha redefinida com sucesso!\nO usuário deverá alterar a senha no próximo logon.`);
      setNewPassword('');
    } catch (err) {
      alert('Erro ao redefinir a senha.');
    } finally {
      setResetLoading(false);
    }
  };

  // Variáveis para facilitar a renderização
  const isUser = userResult?.Type === 'User';
  const isComputer = userResult?.Type === 'Computer';
  const isGroup = userResult?.Type === 'Group';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span style={styles.logoBadge}>K</span>
          <h2 style={{ margin: 0, fontSize: '18px' }}>KAD Mobile</h2>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn}>Sair</button>
      </div>

      <div style={styles.content}>
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <div style={styles.searchWrapper}>
            <input 
              type="text" 
              placeholder="Matrícula, Login, Máquina ou Grupo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.searchBtn}>
              {loading ? <div style={styles.spinner}></div> : '🔍'}
            </button>
          </div>
        </form>

        {error && <div style={styles.errorBox}>⚠️ {error}</div>}

        {userResult && (
          <div style={styles.card}>
            {/* Cabeçalho do Card com Ícone Dinâmico */}
            <div style={styles.cardHeader}>
              <div style={styles.avatar}>
                {isUser ? '👤' : isComputer ? '💻' : isGroup ? '👥' : '🏷️'}
              </div>
              <div>
                <h3 style={styles.cardTitle}>{userResult.DisplayName}</h3>
                <p style={styles.cardSubtitle}>
                  {userResult.SamAccountName} 
                  {userResult.EmployeeID ? ` • Matrícula: ${userResult.EmployeeID}` : ''}
                </p>
              </div>
            </div>

            {/* Status (Para Computadores e Usuários) */}
            {(isUser || isComputer) && (
              <div style={styles.statusRow}>
                <span style={userResult.Enabled ? styles.tagActive : styles.tagInactive}>
                  {userResult.Enabled ? 'Ativo no AD' : 'Desativado'}
                </span>
                {isUser && (
                  <span style={userResult.LockedOut ? styles.tagLocked : styles.tagUnlocked}>
                    {userResult.LockedOut ? 'Conta Bloqueada' : 'Sem Bloqueio'}
                  </span>
                )}
              </div>
            )}

            {/* Informações Extras */}
            {userResult.EmailAddress && <p style={styles.infoText}>✉️ <strong>Email:</strong> {userResult.EmailAddress}</p>}
            {userResult.OS && <p style={styles.infoText}>🖥️ <strong>Sistema:</strong> {userResult.OS}</p>}
            {userResult.Description && <p style={styles.infoText}>📝 <strong>Detalhe:</strong> {userResult.Description}</p>}

            {/* Ações (APENAS PARA USUÁRIOS) */}
            {isUser && (
              <div style={styles.actionsContainer}>
                {userResult.LockedOut && (
                  <button onClick={handleUnlock} style={styles.actionBtnWarning}>
                    🔓 Desbloquear Conta
                  </button>
                )}

                {userResult.Enabled && (
                  <div style={styles.resetContainer}>
                    <p style={styles.sectionLabel}>Redefinir Senha</p>
                    <div style={styles.resetRow}>
                      <input 
                        type="text" 
                        placeholder="Senha temporária" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={styles.inputReset}
                      />
                      <button onClick={handleResetPassword} disabled={resetLoading} style={styles.actionBtnSuccess}>
                        {resetLoading ? '...' : 'Resetar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
}

// Estilos
const styles = {
  container: { backgroundColor: '#121212', minHeight: '100vh', fontFamily: '-apple-system, sans-serif' },
  header: { backgroundColor: '#1e1e1e', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' },
  headerTitle: { display: 'flex', alignItems: 'center', gap: '10px', color: '#fff' },
  logoBadge: { backgroundColor: '#e2a829', color: '#000', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' },
  logoutBtn: { background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '5px' },
  content: { padding: '20px', maxWidth: '600px', margin: '0 auto' },
  searchForm: { marginBottom: '25px' },
  searchWrapper: { display: 'flex', gap: '8px', backgroundColor: '#2d2d2d', borderRadius: '12px', padding: '6px', border: '1px solid #444' },
  input: { flex: 1, backgroundColor: 'transparent', border: 'none', color: '#fff', fontSize: '16px', padding: '10px', outline: 'none' },
  searchBtn: { backgroundColor: '#e2a829', color: '#000', border: 'none', borderRadius: '8px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '20px' },
  spinner: { width: '20px', height: '20px', border: '3px solid rgba(0,0,0,0.3)', borderTop: '3px solid #000', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  errorBox: { backgroundColor: 'rgba(255, 77, 77, 0.1)', color: '#ff4d4d', padding: '12px', borderRadius: '8px', textAlign: 'center', marginBottom: '20px', border: '1px solid rgba(255, 77, 77, 0.3)' },
  
  card: { backgroundColor: '#1e1e1e', borderRadius: '16px', padding: '20px', border: '1px solid #333', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '16px' },
  avatar: { width: '50px', height: '50px', borderRadius: '25px', backgroundColor: '#333', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' },
  cardTitle: { color: '#fff', margin: '0 0 4px 0', fontSize: '18px' },
  cardSubtitle: { color: '#aaa', margin: 0, fontSize: '14px' },
  
  statusRow: { display: 'flex', gap: '10px', marginBottom: '16px' },
  tagActive: { backgroundColor: 'rgba(76, 175, 80, 0.2)', color: '#4CAF50', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' },
  tagInactive: { backgroundColor: 'rgba(153, 153, 153, 0.2)', color: '#999', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' },
  tagUnlocked: { backgroundColor: 'rgba(76, 175, 80, 0.2)', color: '#4CAF50', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' },
  tagLocked: { backgroundColor: 'rgba(255, 77, 77, 0.2)', color: '#ff4d4d', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' },
  
  infoText: { color: '#ddd', fontSize: '14px', margin: '0 0 10px 0' },
  actionsContainer: { display: 'flex', flexDirection: 'column', gap: '15px', borderTop: '1px solid #333', paddingTop: '20px', marginTop: '10px' },
  actionBtnWarning: { backgroundColor: '#ff4d4d', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' },
  
  resetContainer: { backgroundColor: '#252525', padding: '15px', borderRadius: '12px' },
  sectionLabel: { color: '#aaa', fontSize: '13px', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.5px' },
  resetRow: { display: 'flex', gap: '10px' },
  inputReset: { flex: 1, backgroundColor: '#1a1a1a', border: '1px solid #444', color: '#fff', padding: '12px', borderRadius: '8px', fontSize: '14px', outline: 'none' },
  actionBtnSuccess: { backgroundColor: '#4CAF50', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);