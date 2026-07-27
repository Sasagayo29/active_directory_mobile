import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';
import { 
  User, Monitor, Users, Search, Layers, Scale, Database, Printer, 
  CheckCircle, Ban, Unlock, Activity, BarChart, ArrowRight, ArrowLeft, 
  Tag, LogOut, Settings, Server, Trash2, RefreshCw, AlertTriangle 
} from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('single'); 
  const [innerTab, setInnerTab] = useState('geral');

  // Estados: Busca AD
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [localGroups, setLocalGroups] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Estados: Modais e Confirmações
  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [editData, setEditData] = useState({ title: '', department: '', telephone: '' });
  const [modalMoveOpen, setModalMoveOpen] = useState(false);
  const [ouList, setOuList] = useState([]);
  const [selectedOu, setSelectedOu] = useState('');
  const [loadingOus, setLoadingOus] = useState(false);

  // Novo: Modal de Confirmação Customizado
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', action: null });
  // Estados: Modal LAPS/BitLocker
  const [modalSecurityOpen, setModalSecurityOpen] = useState(false);
  const [securityData, setSecurityData] = useState({ laps: '', bitlocker: [] });
  const [securityLoading, setSecurityLoading] = useState(false);

  // Estados: Terminal
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalTitle, setTerminalTitle] = useState('');
  const [terminalContent, setTerminalContent] = useState('');
  const [terminalLoading, setTerminalLoading] = useState(false);

  // Estados: Lote & Comparador
  const [bulkInput, setBulkInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [compareInput, setCompareInput] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);

  // Estados: Vetorh
  const [vetorhData, setVetorhData] = useState({ tipcol: 1, techacc: 'NTU' });
  const [vetorhStatus, setVetorhStatus] = useState('Aguardando...');
  const [vetorhLoading, setVetorhLoading] = useState(false);

  // Estados: Impressoras
  const [printServer, setPrintServer] = useState('');
  const [printersList, setPrintersList] = useState([]);
  const [printersLoading, setPrintersLoading] = useState(false);

  const navigate = useNavigate();
  const handleLogout = () => { localStorage.removeItem('@kad_token'); navigate('/'); };

  // Helper para chamar o Modal de Confirmação
  const showConfirm = (title, message, action) => {
    setConfirmConfig({ isOpen: true, title, message, action });
  };

  const handleConfirmAction = () => {
    if (confirmConfig.action) confirmConfig.action();
    setConfirmConfig({ ...confirmConfig, isOpen: false });
  };

  // ==================== FUNÇÕES CORE AD ====================
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true); setError(''); setSearchResults([]); setSelectedUser(null); setNewPassword(''); setLocalGroups(null); setInnerTab('geral');
    try {
      const response = await api.get(`/users/${searchTerm}`);
      setSearchResults(response.data.data);
      if (response.data.data.length === 1) selectUserForDetail(response.data.data[0]);
    } catch (err) { setError(err.response?.status === 404 ? 'Nenhum resultado localizado no diretório.' : 'Erro de conexão.'); } 
    finally { setLoading(false); }
  };

  const selectUserForDetail = (user) => {
    setSelectedUser(user);
    setEditData({ title: user.Title || '', department: user.Department || '', telephone: user.TelephoneNumber || '' });
    setVetorhData({ tipcol: 1, techacc: 'NTU' });

    if (user.Type === 'User' && user.EmployeeID) {
      setVetorhStatus('Consultando DB...');
      setVetorhLoading(true);
      api.get(`/vetorh/${user.EmployeeID}`)
        .then(res => {
          const fetchedTipcol = parseInt(res.data.tipcol) || 1;
          const fetchedTechacc = res.data.techacc ? res.data.techacc.trim().toUpperCase() : 'NTU';
          const tipoStr = fetchedTipcol === 1 ? 'Próprio' : 'Terceiro';
          
          setVetorhData({ tipcol: fetchedTipcol, techacc: fetchedTechacc });

          if (res.data.error) setVetorhStatus(`Erro: ${res.data.error}`);
          else if (res.data.message) setVetorhStatus(res.data.message);
          else setVetorhStatus(`${fetchedTechacc} (${tipoStr})`);
        })
        .catch(() => setVetorhStatus('Falha de conexão com SQL'))
        .finally(() => setVetorhLoading(false));
    } else {
      setVetorhStatus('Sem Matrícula');
    }
  };

  // ==================== VETORH (SQL) ====================
  const saveVetorh = async () => {
    setVetorhLoading(true);
    try {
      await api.post('/vetorh/update', { matriculas: [selectedUser.EmployeeID], tipcol: vetorhData.tipcol, techacc: vetorhData.techacc });
      toast.success('Integração com Vetorh executada com sucesso.');
      setVetorhStatus(`${vetorhData.techacc} (${vetorhData.tipcol === 1 ? 'Próprio' : 'Terceiro'})`);
    } catch (err) { toast.error(err.response?.data?.detail || 'Falha ao atualizar banco de dados.'); } 
    finally { setVetorhLoading(false); }
  };

  // ==================== IMPRESSORAS ====================
  const handleSearchPrinters = async (e) => {
    if (e) e.preventDefault();
    if (!printServer.trim()) return;
    setPrintersLoading(true); setPrintersList([]);
    try {
      const response = await api.get(`/printers/${printServer}`);
      const dadosRetorno = response.data.data;
      const dataArray = Array.isArray(dadosRetorno) ? dadosRetorno : (dadosRetorno ? [dadosRetorno] : []);
      setPrintersList(dataArray);
      if(dataArray.length === 0) toast.error('Nenhuma impressora encontrada.');
    } catch (err) { toast.error(err.response?.data?.detail || 'Falha ao comunicar com o servidor.'); } 
    finally { setPrintersLoading(false); }
  };

  const clearQueue = (queue) => {
    showConfirm('Limpar Fila de Impressão', `Tem certeza que deseja remover todos os documentos travados na fila ${queue}?`, async () => {
      try { await api.post(`/printers/${printServer}/${queue}/clear`); toast.success('Fila de impressão esvaziada.'); } 
      catch (err) { toast.error(err.response?.data?.detail || 'Erro ao limpar fila.'); }
    });
  };

  const restartSpooler = () => {
    showConfirm('Reiniciar Serviço de Spooler', `Atenção: Reiniciar o Spooler em ${printServer} derrubará conexões ativas momentaneamente. Prosseguir?`, async () => {
      try { await api.post(`/printers/${printServer}/restart-spooler`); toast.success('Serviço de Spooler reiniciado remotamente.'); } 
      catch (err) { toast.error(err.response?.data?.detail || 'Erro na operação remota.'); }
    });
  };

  const runPrintDiagnostic = async (type) => {
    if (!printServer) return;
    setTerminalTitle(`Terminal | ${type.toUpperCase()} - ${printServer}`);
    setTerminalContent(`[SYS] Iniciando varredura remota para ${printServer}...\n\n`);
    setTerminalOpen(true); setTerminalLoading(true);
    try {
      const response = await api.get(`/diagnostics/${printServer}/${type}`);
      setTerminalContent(prev => prev + response.data.output + '\n\n[SYS] Processo finalizado.');
    } catch (err) { setTerminalContent(prev => prev + '\n[ERRO] Falha crítica de comunicação com o servidor.'); } 
    finally { setTerminalLoading(false); }
  };

  const pingPrinter = async (printerName, portName) => {
    // Extrai o IP caso a porta venha com prefixos (Ex: IP_10.205.99.50 vira 10.205.99.50)
    const ipMatch = portName?.match(/\d{1,3}(\.\d{1,3}){3}/);
    const targetIp = ipMatch ? ipMatch[0] : portName;

    if (!targetIp) return toast.error('Porta TCP/IP não identificada.');

    setTerminalTitle(`Terminal | PING - ${printerName} (${targetIp})`);
    setTerminalContent(`[SYS] Disparando pacotes ICMP para ${targetIp}...\n\n`);
    setTerminalOpen(true); setTerminalLoading(true);
    try {
      const response = await api.get(`/diagnostics/${targetIp}/ping`);
      setTerminalContent(prev => prev + response.data.output + '\n\n[SYS] Processo finalizado.');
    } catch (err) {
      setTerminalContent(prev => prev + '\n[ERRO] Falha ao pingar a impressora.');
    } finally {
      setTerminalLoading(false);
    }
  };

  // ==================== DIAGNÓSTICOS ====================
  const runDiagnostic = async (type) => {
    const target = type === 'splunk' ? selectedUser.SamAccountName : (selectedUser.OS ? selectedUser.DisplayName : selectedUser.SamAccountName);
    setTerminalTitle(`Terminal | ${type.toUpperCase()}`);
    setTerminalContent(`[SYS] Iniciando varredura remota para ${target}...\n\n`);
    setTerminalOpen(true); setTerminalLoading(true);
    try {
      const response = await api.get(`/diagnostics/${target}/${type}`);
      setTerminalContent(prev => prev + response.data.output + '\n\n[SYS] Processo finalizado.');
    } catch (err) { setTerminalContent(prev => prev + '\n[ERRO] Falha crítica de comunicação.'); } 
    finally { setTerminalLoading(false); }
  };

  // ==================== COMPARADOR E LOTE ====================
  const handleCompare = async () => {
    const usersArray = compareInput.split(',').map(u => u.trim()).filter(u => u !== '');
    if (usersArray.length < 2) return toast.error('Requer mínimo de 2 identidades para comparação.');
    setCompareLoading(true); setCompareResult(null);
    try { const response = await api.post('/compare', { usernames: usersArray }); setCompareResult(response.data); toast.success('Matriz gerada com sucesso.'); } 
    catch (err) { toast.error('Erro ao cruzar os dados de permissão.'); } finally { setCompareLoading(false); }
  };

  const handleBulkAction = (actionType) => {
    const usersArray = bulkInput.split(',').map(u => u.trim()).filter(u => u !== '');
    if (usersArray.length === 0) return toast.error('Insira os identificadores antes de continuar.');
    
    showConfirm('Processamento em Lote', `Deseja executar a ação em massa para ${usersArray.length} objeto(s)?`, async () => {
      setBulkLoading(true); setBulkResult(null);
      try { const response = await api.post(`/bulk/${actionType}`, { usernames: usersArray }); setBulkResult(response.data); toast.success('Lote finalizado.'); } 
      catch (err) { toast.error('Falha crítica ao processar o lote.'); } finally { setBulkLoading(false); }
    });
  };

  // ==================== AÇÕES BÁSICAS AD ====================
  const handleUnlock = async () => { 
    try { await api.post(`/users/${selectedUser.SamAccountName}/unlock`); toast.success('Conta desbloqueada com sucesso.'); handleSearch(); } 
    catch (err) { toast.error(err.response?.data?.detail || 'Erro ao desbloquear conta.'); } 
  };
  
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) return toast.error('A senha deve conter no mínimo 8 caracteres.');
    setResetLoading(true);
    try { await api.post(`/users/${selectedUser.SamAccountName}/reset-password`, { new_password: newPassword, force_change: true, unlock_account: true }); toast.success('Credenciais redefinidas e conta desbloqueada.'); setNewPassword(''); } 
    catch (err) { toast.error(err.response?.data?.detail || 'Erro ao resetar senha.'); } finally { setResetLoading(false); }
  };

  const handleToggleStatus = () => {
    const acaoText = selectedUser.Enabled ? 'desativar' : 'ativar';
    showConfirm('Alteração de Status', `Deseja realmente ${acaoText} este objeto no Active Directory?`, async () => {
      try { await api.post(`/users/${selectedUser.SamAccountName}/toggle-status`); toast.success('Status modificado com sucesso.'); handleSearch(); } 
      catch (err) { toast.error(err.response?.data?.detail || 'Falha ao alterar status.'); }
    });
  };

  const handleSaveProfile = async () => { 
    try { await api.post(`/users/${selectedUser.SamAccountName}/edit-profile`, editData); toast.success('Perfil atualizado.'); setModalEditOpen(false); handleSearch(); } 
    catch (err) { toast.error('Erro ao atualizar perfil.'); } 
  };

  const openMoveModal = async () => {
    setModalMoveOpen(true); if (ouList.length > 0) return; setLoadingOus(true);
    try { const response = await api.get('/ous'); setOuList(response.data.data); } 
    catch (err) { toast.error('Falha ao obter árvore de diretórios.'); } finally { setLoadingOus(false); }
  };

  const handleMoveOu = async () => { 
    try { await api.post(`/users/${selectedUser.SamAccountName}/move`, { new_ou: selectedOu }); toast.success('Objeto movido organizacionalmente.'); setModalMoveOpen(false); handleSearch(); } 
    catch (err) { toast.error('Erro ao movimentar OU.'); } 
  };

  const fetchLocalGroups = async () => { 
    setLoadingGroups(true); 
    try { 
      const response = await api.get(`/computers/${selectedUser.SamAccountName}/local-groups`); 
      const dt = response.data.data;
      // Garante que o frontend sempre receba um Array, evitando a quebra do .map()
      const arr = Array.isArray(dt) ? dt : (dt ? [dt] : []);
      setLocalGroups(arr); 
      toast.success('Grupos mapeados.'); 
    } catch (err) { 
      toast.error(err.response?.data?.detail || 'Falha via WinRM. Computador inacessível.'); 
    } finally { 
      setLoadingGroups(false); 
    } 
  };

  const fetchSecurityKeys = async () => {
    setModalSecurityOpen(true);
    setSecurityLoading(true);
    try {
      const response = await api.get(`/computers/${selectedUser.SamAccountName}/security`);
      setSecurityData(response.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Acesso negado ou erro ao ler chaves.');
      setModalSecurityOpen(false);
    } finally {
      setSecurityLoading(false);
    }
  };

  const isUser = selectedUser?.Type === 'User';
  const isComputer = selectedUser?.Type === 'Computer';
  const isGroup = selectedUser?.Type === 'Group';

  const renderIcon = (type, size = 20) => {
    if (type === 'User') return <User size={size} />;
    if (type === 'Computer') return <Monitor size={size} />;
    if (type === 'Group') return <Users size={size} />;
    return <Tag size={size} />;
  };

  return (
    <div style={styles.container}>
      {/* COMPONENTE TOASTER (Substitui os alerts nativos) */}
      <Toaster position="top-right" toastOptions={{ style: { background: COLORS.cell, color: COLORS.text, border: `1px solid ${COLORS.border}`, fontSize: '13px' }, success: { iconTheme: { primary: COLORS.success, secondary: COLORS.bg } }, error: { iconTheme: { primary: COLORS.danger, secondary: COLORS.bg } } }} />

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerTitle}><div style={styles.logoBadge}>K</div><h2 style={{ margin: 0, fontSize: '18px', color: COLORS.gold, fontWeight: 600 }}>KAD Mobile</h2></div>
        <button onClick={handleLogout} style={styles.logoutBtn}><LogOut size={18} /></button>
      </div>

      {/* NAVEGAÇÃO PRINCIPAL */}
      <div style={styles.tabContainer}>
        <button style={activeTab === 'single' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('single')}><Search size={16} /> Identidade</button>
        <button style={activeTab === 'bulk' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('bulk')}><Layers size={16} /> Lote</button>
        <button style={activeTab === 'compare' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('compare')}><Scale size={16} /> Comparador</button>
        <button style={activeTab === 'printers' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('printers')}><Printer size={16} /> Print</button>
      </div>

      <div style={styles.content}>
        
        {/* ================= ABA 1: IDENTIDADE ================= */}
        {activeTab === 'single' && (
          <>
            <form onSubmit={handleSearch} style={styles.searchForm}>
              <div style={styles.searchWrapper}>
                <input type="text" placeholder="Nome, Matrícula, Hostname..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.input} />
                <button type="submit" disabled={loading} style={styles.searchBtn}>{loading ? <div style={styles.spinner}></div> : <Search size={20} />}</button>
              </div>
            </form>
            {error && <div style={styles.errorBox}><Ban size={16} /> {error}</div>}

            {searchResults.length > 1 && !selectedUser && (
              <div>
                <div style={styles.listGrid}>
                  {searchResults.length > 1 && !selectedUser && (
              <div>
                <p style={{ color: COLORS.gold, marginBottom: '15px', fontWeight: 'bold' }}>Resultados da pesquisa ({searchResults.length}):</p>
                <div style={styles.listGrid}>
                  {searchResults.map((item, idx) => {
                    const isDanger = !item.Enabled || item.LockedOut;
                    
                    return (
                    <div key={idx} onClick={() => selectUserForDetail(item)} style={{...styles.miniCard, borderColor: isDanger ? COLORS.danger : COLORS.border}}>
                      <div style={{...styles.miniAvatar, color: isDanger ? COLORS.danger : COLORS.gold, backgroundColor: isDanger ? 'rgba(239, 68, 68, 0.1)' : COLORS.cell}}>
                        {renderIcon(item.Type)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{...styles.miniCardTitle, color: isDanger ? COLORS.danger : COLORS.text}}>
                           {item.DisplayName} {isDanger && <Ban size={12} style={{marginLeft: '6px'}} />}
                        </h4>
                        <p style={styles.miniCardSubtitle}>
                           {item.SamAccountName} {item.EmployeeID ? `• Mat: ${item.EmployeeID}` : ''}
                           {isDanger && <span style={{color: COLORS.danger, fontWeight: 'bold'}}> • ({item.LockedOut ? 'Bloqueado' : 'Desativado'})</span>}
                        </p>
                      </div>
                      <div style={{ color: isDanger ? COLORS.danger : COLORS.gold }}><ArrowRight size={18} /></div>
                    </div>
                  )})}
                </div>
              </div>
            )}
                </div>
              </div>
            )}

            {selectedUser && (
              <div style={styles.card}>
                {searchResults.length > 1 && <button onClick={() => setSelectedUser(null)} style={styles.backBtn}><ArrowLeft size={16} /> Voltar à lista</button>}
                <div style={styles.cardHeader}>
                  <div style={styles.avatar}>{renderIcon(selectedUser.Type, 24)}</div>
                  <div style={{flex: 1}}>
                    <h3 style={styles.cardTitle}>{selectedUser.DisplayName}</h3>
                    <p style={styles.cardSubtitle}>{selectedUser.SamAccountName} {selectedUser.EmployeeID ? `• Matrícula: ${selectedUser.EmployeeID}` : ''}</p>
                  </div>
                </div>

                <div style={styles.statusRow}>
                  <button onClick={handleToggleStatus} style={selectedUser.Enabled ? styles.tagActive : styles.tagInactive}>
                    {selectedUser.Enabled ? <><CheckCircle size={14}/> Ativo (Desativar)</> : <><Ban size={14}/> Desativado (Ativar)</>}
                  </button>
                  {isUser && <span style={selectedUser.LockedOut ? styles.tagLocked : styles.tagUnlocked}>{selectedUser.LockedOut ? <><AlertTriangle size={14}/> Bloqueada</> : <><CheckCircle size={14}/> Sem Bloqueio</>}</span>}
                  <span style={styles.tagType}>{selectedUser.Type}</span>
                </div>

                <div style={styles.innerTabs}>
                  <button style={innerTab === 'geral' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('geral')}>Geral</button>
                  {isUser && <button style={innerTab === 'seguranca' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('seguranca')}>Segurança</button>}
                  {isComputer && <button style={innerTab === 'seguranca' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('seguranca')}>Diagnósticos</button>}
                  
                  {/* Botão Dinâmico de Relacionamentos (Grupos vs Membros) */}
                  <button style={innerTab === 'grupos' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('grupos')}>
                    {isGroup ? `Membros (${selectedUser.Members?.length || 0})` : `Grupos (${selectedUser.MemberOf?.length || 0})`}
                  </button>
                  
                  {isUser && selectedUser.EmployeeID && <button style={innerTab === 'vetorh' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('vetorh')}>Vetorh DB</button>}
                </div>

                <div style={styles.innerContent}>
                  
                  {/* ======================= ABA GERAL ======================= */}
                  {innerTab === 'geral' && (
                    <>
                      {/* VISTA: COMPUTADOR */}
                      {isComputer && (
                        <>
                          <p style={styles.sectionLabel}>Identificação de Rede</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>DNS</span><span style={styles.detailValue}>{selectedUser.DNS}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>IPv4</span><span style={styles.detailValue}>{selectedUser.IPv4}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>S. Operacional</span><span style={styles.detailValue}>{selectedUser.OS}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Gerenciado Por</span><span style={styles.detailValue}>{selectedUser.Manager}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Descrição</span><span style={styles.detailValue}>{selectedUser.Description}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Última Ativação</span><span style={styles.detailValue}>{selectedUser.LastLogon}</span></div>
                          </div>
                        </>
                      )}

                      {/* VISTA: USUÁRIO */}
                      {isUser && (
                        <>
                          <p style={styles.sectionLabel}>Organização Corporativa</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>E-mail</span><span style={styles.detailValue}>{selectedUser.EmailAddress || 'N/A'}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Telefone</span><span style={styles.detailValue}>{selectedUser.TelephoneNumber}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Cargo</span><span style={styles.detailValue}>{selectedUser.Title}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Departamento</span><span style={styles.detailValue}>{selectedUser.Department}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Empresa</span><span style={styles.detailValue}>{selectedUser.Company}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Escritório</span><span style={styles.detailValue}>{selectedUser.Office}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Gerente Direto</span><span style={styles.detailValue}>{selectedUser.Manager}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Supervisiona ({selectedUser.DirectReports?.length || 0})</span><span style={styles.detailValue}>{selectedUser.DirectReports?.length > 0 ? selectedUser.DirectReports.join(', ') : 'Nenhum'}</span></div>
                          </div>
                          
                          <p style={{...styles.sectionLabel, marginTop: '20px'}}>Identidade e Acessos</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Status da Conta</span><span style={{...styles.detailValue, color: selectedUser.Enabled ? COLORS.success : COLORS.danger}}>{selectedUser.Enabled ? 'Ativa' : 'Desativada'}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Bloqueado?</span><span style={{...styles.detailValue, color: selectedUser.LockedOut ? COLORS.warning : COLORS.text}}>{selectedUser.LockedOut ? 'Sim' : 'Não'}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Senha Nunca Expira?</span><span style={styles.detailValue}>{selectedUser.PasswordNeverExpires ? 'Sim' : 'Não'}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Pode Alterar Senha?</span><span style={{...styles.detailValue, color: COLORS.muted}}>N/A (Via AD ACLs)</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Último Logon</span><span style={styles.detailValue}>{selectedUser.LastLogon}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Acesso Vetorh</span><span style={{...styles.detailValue, color: COLORS.gold}}>{vetorhStatus}</span></div>
                          </div>
                        </>
                      )}

                      {/* VISTA: GRUPO */}
                      {isGroup && (
                        <>
                          <p style={styles.sectionLabel}>Especificações do Grupo</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Nome (Display)</span><span style={styles.detailValue}>{selectedUser.DisplayName}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Categoria (Cat)</span><span style={styles.detailValue}>{selectedUser.GroupCategory}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Escopo</span><span style={styles.detailValue}>{selectedUser.GroupScope}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Gerenciado Por</span><span style={styles.detailValue}>{selectedUser.Manager}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Descrição</span><span style={styles.detailValue}>{selectedUser.Description}</span></div>
                          </div>
                        </>
                      )}

                      {/* METADADOS COMUNS (RENDERIZADOS PARA TODOS) */}
                      <p style={{...styles.sectionLabel, marginTop: '20px'}}>Metadados de Diretório</p>
                      <div style={styles.detailGrid}>
                        <div style={styles.detailItemFull}><span style={styles.detailLabel}>Nome Canônico (DN)</span><span style={styles.detailValueMicro}>{selectedUser.DN}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>Classe do Objeto</span><span style={styles.detailValue}>{selectedUser.ObjectClass}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>Criado em</span><span style={styles.detailValue}>{selectedUser.Created}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>Modificado em</span><span style={styles.detailValue}>{selectedUser.Modified}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>USN (Original)</span><span style={styles.detailValue}>{selectedUser.USNCreated}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>USN (Atual)</span><span style={styles.detailValue}>{selectedUser.USNChanged}</span></div>
                      </div>
                    </>
                  )}
                  {/* ======================================================== */}

                  {/* ================= ABA DE RELACIONAMENTOS ================= */}
                  {innerTab === 'grupos' && (
                     <div style={styles.listContainer}>
                       {isGroup ? (
                         selectedUser.Members?.length === 0 ? <p style={styles.hintText}>Nenhum membro neste grupo.</p> : selectedUser.Members.map((m, i) => <div key={i} style={styles.listItem}><User size={14} style={{marginRight: '8px', color: COLORS.muted}}/> {m}</div>)
                       ) : (
                         selectedUser.MemberOf?.length === 0 ? <p style={styles.hintText}>Nenhum relacionamento encontrado.</p> : selectedUser.MemberOf.map((g, i) => <div key={i} style={styles.listItem}><Users size={14} style={{marginRight: '8px', color: COLORS.muted}}/> {g}</div>)
                       )}
                     </div>
                  )}

                  {/* ================= ABA DE SEGURANÇA / DIAGNÓSTICO ================= */}
                  {innerTab === 'seguranca' && (
                    <div style={styles.actionSection}>
                      
                      <div style={styles.actionsGrid}>
                        {isUser && <button onClick={() => setModalEditOpen(true)} style={styles.gridBtn}><Settings size={14} /> Editar Perfil</button>}
                        {(isUser || isComputer) && <button onClick={openMoveModal} style={styles.gridBtn}><Server size={14} /> Mover OU</button>}
                        {isComputer && <button onClick={fetchLocalGroups} disabled={loadingGroups} style={styles.gridBtn}>{loadingGroups ? 'Processando...' : <><Users size={14}/> Grupos Locais</>}</button>}
                        {isComputer && <button onClick={fetchSecurityKeys} style={{...styles.gridBtn, borderColor: COLORS.success, color: COLORS.success, fontWeight: 'bold'}}><Unlock size={14}/> LAPS & BitLocker</button>}
                      </div>

                      <p style={styles.sectionLabel}>Telemetria e Diagnósticos</p>
                      <div style={styles.actionsGrid}>
                        {isComputer && <button onClick={() => runDiagnostic('ping')} style={styles.diagBtn}><Activity size={14}/> Ping ICMP</button>}
                        {isComputer && <button onClick={() => runDiagnostic('wmi')} style={styles.diagBtn}><BarChart size={14}/> WMI Hardware</button>}
                        {isUser && <button onClick={() => runDiagnostic('splunk')} style={{...styles.diagBtn, borderColor: COLORS.warning, color: COLORS.warning}}><Search size={14}/> Rastrear Bloqueio</button>}
                      </div>

                      {isComputer && localGroups && (
                         <div style={styles.groupsBox}>
                           <p style={styles.sectionLabel}>Mapeamento de Administradores Locais</p>
                           {localGroups.length === 0 ? <p style={styles.hintText}>Lista vazia.</p> : localGroups.map((g, i) => <div key={i} style={styles.groupItem}><strong>{g.Grupo}:</strong> {g.Membro}</div>)}
                         </div>
                      )}

                      {isUser && (
                        <div style={styles.dangerZone}>
                          {selectedUser.LockedOut && <button onClick={handleUnlock} style={styles.actionBtnWarning}><Unlock size={14}/> Desbloquear Conta</button>}
                          {selectedUser.Enabled && (
                            <div style={styles.resetContainer}>
                              <p style={styles.sectionLabel}>Redefinir Credenciais</p>
                              <div style={styles.resetRow}>
                                <input type="text" placeholder="Senha provisória" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={styles.inputReset} />
                                <button onClick={handleResetPassword} disabled={resetLoading} style={styles.actionBtnSuccess}>{resetLoading ? 'Aguarde' : 'Confirmar'}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ================= ABA VETORH ================= */}
                  {innerTab === 'vetorh' && (
                     <div style={styles.actionSection}>
                       {vetorhLoading ? <p style={styles.hintText}>Sincronizando com SQL Server...</p> : (
                         <>
                           <div style={styles.resetContainer}>
                             <p style={styles.sectionLabel}>Tipo de Colaborador</p>
                             <select value={vetorhData.tipcol} onChange={(e) => setVetorhData({...vetorhData, tipcol: parseInt(e.target.value)})} style={styles.modalSelect}>
                               <option value={1}>1 - Próprio</option>
                               <option value={2}>2 - Terceiro</option>
                             </select>
                           </div>
                           <div style={styles.resetContainer}>
                             <p style={styles.sectionLabel}>Nível de Acesso Técnico</p>
                             <select value={vetorhData.techacc} onChange={(e) => setVetorhData({...vetorhData, techacc: e.target.value})} style={styles.modalSelect}>
                               <option value="NTU">NTU (Básico)</option>
                               <option value="LTU">LTU (Leitura)</option>
                               <option value="ETU">ETU (Edição)</option>
                             </select>
                           </div>
                           <button onClick={saveVetorh} style={{...styles.gridBtn, backgroundColor: COLORS.success, color: COLORS.bg, fontWeight: 'bold'}}><Database size={14}/> Aplicar Procedure</button>
                         </>
                       )}
                     </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= ABA 2: LOTE ================= */}
        {activeTab === 'bulk' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Transação em Lote</h3>
            <p style={styles.hintText}>Insira os identificadores divididos por vírgula.</p>
            <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} placeholder="Identificadores..." style={styles.textArea} />
            <div style={styles.bulkActionsGrid}>
              <button disabled={bulkLoading} onClick={() => handleBulkAction('unlock')} style={styles.bulkBtnUnlock}><Unlock size={14}/> Desbloquear</button>
              <button disabled={bulkLoading} onClick={() => handleBulkAction('enable')} style={styles.bulkBtnEnable}><CheckCircle size={14}/> Ativar</button>
              <button disabled={bulkLoading} onClick={() => handleBulkAction('disable')} style={styles.bulkBtnDisable}><Ban size={14}/> Desativar</button>
            </div>
            {bulkResult && (
              <div style={styles.bulkResultBox}>
                <p style={{ color: COLORS.success, fontWeight: 'bold', margin: '0 0 10px 0' }}>Concluídos: {bulkResult.success_count} de {bulkResult.total}</p>
                {bulkResult.errors.length > 0 && (
                  <div>
                    <p style={{ color: COLORS.danger, fontSize: '13px', margin: '0 0 5px 0' }}>Exceções:</p>
                    <ul style={{ color: COLORS.danger, fontSize: '12px', paddingLeft: '20px', margin: 0 }}>
                      {bulkResult.errors.map((err, idx) => <li key={idx}><strong>{err.user}:</strong> {err.error}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA 3: COMPARADOR ================= */}
        {activeTab === 'compare' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Matriz de Permissões</h3>
            <p style={styles.hintText}>Avalie divergências em políticas de segurança.</p>
            <div style={styles.searchWrapper}>
              <input type="text" placeholder="Logins..." value={compareInput} onChange={(e) => setCompareInput(e.target.value)} style={styles.input} />
              <button onClick={handleCompare} disabled={compareLoading} style={styles.searchBtn}>{compareLoading ? <div style={styles.spinner}></div> : <Scale size={18} />}</button>
            </div>

            {compareResult && (
              <div style={{ marginTop: '20px' }}>
                <div style={styles.commonBox}>
                  <p style={{ color: COLORS.success, fontWeight: 'bold', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '5px' }}><CheckCircle size={16}/> Conformidade (Em Comum)</p>
                  <div style={styles.listContainer}>
                    {compareResult.common_groups.map((g, idx) => <div key={idx} style={{...styles.listItem, color: COLORS.success, borderColor: COLORS.success}}>{g}</div>)}
                  </div>
                </div>

                <p style={{ color: COLORS.warning, fontWeight: 'bold', margin: '20px 0 10px 0' }}>Divergências (Exclusivos)</p>
                <div style={styles.diffGrid}>
                  {Object.keys(compareResult.users).map((username, idx) => (
                    <div key={idx} style={styles.diffCard}>
                      <p style={{ margin: '0 0 5px 0', color: COLORS.gold, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}><User size={14}/> {username.toUpperCase()}</p>
                      <div style={styles.listContainer}>
                        {compareResult.users[username].ExclusiveGroups.map((g, i) => <div key={i} style={{...styles.listItem, padding: '6px', fontSize: '11px'}}>{g}</div>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= ABA 4: IMPRESSORAS ================= */}
        {activeTab === 'printers' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Gestor de Spool</h3>
            <p style={styles.hintText}>Mapeamento de recursos em servidores físicos.</p>
            <form onSubmit={handleSearchPrinters} style={styles.searchForm}>
              <div style={styles.searchWrapper}>
                <input type="text" placeholder="Servidor (Ex: PTU-PRN-01)" value={printServer} onChange={(e) => setPrintServer(e.target.value)} style={styles.input} />
                <button type="submit" disabled={printersLoading} style={styles.searchBtn}>{printersLoading ? <div style={styles.spinner}></div> : <Search size={20} />}</button>
              </div>
            </form>

            {printersList.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
  <button onClick={restartSpooler} style={{...styles.actionBtnWarning, flex: 1, display: 'flex', justifyContent: 'center', gap: '8px'}}>
    <RefreshCw size={16}/> Spooler
  </button>
  <button onClick={() => runPrintDiagnostic('ping')} style={{...styles.diagBtn, flex: 1, display: 'flex', justifyContent: 'center', gap: '8px'}}>
    <Activity size={16}/> Ping
  </button>
  <button onClick={() => runPrintDiagnostic('wmi')} style={{...styles.diagBtn, flex: 1, display: 'flex', justifyContent: 'center', gap: '8px'}}>
    <BarChart size={16}/> WMI
  </button>
</div>
                <div style={styles.listGrid}>
  {printersList.map((prn, idx) => (
    <div key={idx} style={{...styles.card, padding: '15px', cursor: 'default'}}>
      
      {/* Cabeçalho da Impressora */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px'}}>
        <div>
          <h4 style={{...styles.cardTitle, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <Printer size={16}/> {prn.Name}
          </h4>
          <p style={styles.miniCardSubtitle}>{prn.DriverName}</p>
        </div>
        <span style={{backgroundColor: COLORS.cell, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: COLORS.gold, border: `1px solid ${COLORS.border}`, fontWeight: 'bold'}}>
          {prn.JobCount} docs
        </span>
      </div>
      
      {/* Detalhes Extraídos (Como no Desktop) */}
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px'}}>
         <div style={styles.detailItem}>
           <span style={styles.detailLabel}>Porta / IP</span>
           <span style={styles.detailValue}>{prn.PortName || 'N/A'}</span>
         </div>
         <div style={styles.detailItem}>
           <span style={styles.detailLabel}>Status Físico</span>
           <span style={styles.detailValue}>{prn.PrinterStatus?.Value || prn.PrinterStatus || 'Normal'}</span>
         </div>
         <div style={styles.detailItemFull}>
           <span style={styles.detailLabel}>Localização</span>
           <span style={styles.detailValue}>{prn.Location || 'Não informada no AD'}</span>
         </div>
      </div>

      {/* Botões de Ação Individual */}
      <div style={{display: 'flex', gap: '10px'}}>
        <button onClick={() => pingPrinter(prn.Name, prn.PortName)} style={{...styles.gridBtn, flex: 1, borderColor: '#38BDF8', color: '#38BDF8'}}>
          <Activity size={14}/> Ping
        </button>
        <button onClick={() => clearQueue(prn.Name)} style={{...styles.gridBtn, flex: 1, borderColor: COLORS.warning, color: COLORS.warning}}>
          <Trash2 size={14}/> Limpar Fila
        </button>
      </div>

    </div>
  ))}
</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* MODAL: VISOR LAPS E BITLOCKER */}
      {modalSecurityOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '500px'}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px'}}><Unlock size={18}/> Chaves de Criptografia</h3>
            {securityLoading ? (
              <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: COLORS.gold, padding: '20px 0'}}>
                <div style={styles.spinner}></div> <p>Descriptografando atributos de segurança do AD...</p>
              </div>
            ) : (
              <>
                <div style={styles.resetContainer}>
                  <p style={styles.sectionLabel}>Senha Local Admin (LAPS)</p>
                  <input type="text" readOnly value={securityData.laps} style={{...styles.modalInput, color: COLORS.success, fontWeight: 'bold', fontSize: '18px', letterSpacing: '1px', textAlign: 'center'}} />
                </div>
                
                <div style={{...styles.resetContainer, marginTop: '15px'}}>
                  <p style={styles.sectionLabel}>Recovery Keys (BitLocker)</p>
                  {securityData.bitlocker.length === 0 ? (
                     <p style={styles.hintText}>Nenhuma chave de recuperação armazenada no diretório para este ativo.</p>
                  ) : (
                     <div style={{maxHeight: '180px', overflowY: 'auto'}}>
                       {securityData.bitlocker.map((bk, idx) => (
                         <div key={idx} style={{backgroundColor: COLORS.bg, padding: '12px', borderRadius: '4px', marginBottom: '10px', border: `1px solid ${COLORS.border}`}}>
                           <p style={{margin: '0 0 6px 0', fontSize: '11px', color: COLORS.muted}}>Backup gerado em: {bk.date}</p>
                           <p style={{margin: 0, fontSize: '14px', color: COLORS.text, fontFamily: 'monospace', userSelect: 'all'}}>{bk.key}</p>
                         </div>
                       ))}
                     </div>
                  )}
                </div>
              </>
            )}
            <div style={styles.modalActions}>
              <button onClick={() => setModalSecurityOpen(false)} style={styles.modalCancelBtn}>Fechar Visor Seguro</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO GENÉRICA (Substitui window.confirm) */}
      {confirmConfig.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{color: COLORS.gold, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px'}}><AlertTriangle size={18}/> {confirmConfig.title}</h3>
            <p style={{color: COLORS.text, fontSize: '13px', marginBottom: '20px', lineHeight: '1.5'}}>{confirmConfig.message}</p>
            <div style={styles.modalActions}>
              <button onClick={() => setConfirmConfig({...confirmConfig, isOpen: false})} style={styles.modalCancelBtn}>Cancelar</button>
              <button onClick={handleConfirmAction} style={styles.modalSaveBtn}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TERMINAL */}
      {terminalOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '600px', backgroundColor: '#000', border: `1px solid ${COLORS.border}`}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 10px 0', fontFamily: 'monospace', fontSize: '14px'}}>{terminalTitle}</h3>
            <textarea readOnly value={terminalContent} style={{ width: '100%', height: '300px', backgroundColor: '#000', color: '#00FF00', fontFamily: 'monospace', fontSize: '12px', border: 'none', outline: 'none', resize: 'none' }} />
            <div style={styles.modalActions}>
              <button disabled={terminalLoading} onClick={() => setTerminalOpen(false)} style={{...styles.modalSaveBtn, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>{terminalLoading ? 'Aguarde' : 'Encerrar Sessão'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR PERFIL */}
      {modalEditOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0'}}>Atualização de Registro</h3>
            <input type="text" value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} style={styles.modalInput} placeholder="Cargo" />
            <input type="text" value={editData.department} onChange={e => setEditData({...editData, department: e.target.value})} style={{...styles.modalInput, marginTop: '10px'}} placeholder="Departamento" />
            <input type="text" value={editData.telephone} onChange={e => setEditData({...editData, telephone: e.target.value})} style={{...styles.modalInput, marginTop: '10px'}} placeholder="Telefone" />
            <div style={styles.modalActions}>
              <button onClick={() => setModalEditOpen(false)} style={styles.modalCancelBtn}>Cancelar</button>
              <button onClick={handleSaveProfile} style={styles.modalSaveBtn}>Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MOVER OU */}
      {modalMoveOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0'}}>Movimentação Estrutural</h3>
            {loadingOus ? <p style={{color: COLORS.gold, fontSize: '13px'}}>Carregando estrutura...</p> : (
              <select value={selectedOu} onChange={(e) => setSelectedOu(e.target.value)} style={styles.modalSelect}>
                <option value="">-- Destino Organizacional --</option>
                {ouList.map((ou, idx) => <option key={idx} value={ou.dn}>{ou.ou}</option>)}
              </select>
            )}
            <div style={styles.modalActions}>
              <button onClick={() => setModalMoveOpen(false)} style={styles.modalCancelBtn}>Cancelar</button>
              <button onClick={handleMoveOu} style={styles.modalSaveBtn}>Movimentar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ESTILOS CORPORATIVOS
const COLORS = { bg: '#0B111E', frame: '#161F32', cell: '#121824', border: '#24324D', gold: '#C5A059', text: '#F8FAFC', muted: '#94A3B8', success: '#10B981', warning: '#F59E0B', danger: '#EF4444' };

const styles = {
  container: { backgroundColor: COLORS.bg, minHeight: '100vh', fontFamily: '-apple-system, sans-serif', paddingBottom: '30px', color: COLORS.text },
  header: { backgroundColor: COLORS.frame, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLORS.border}` },
  headerTitle: { display: 'flex', alignItems: 'center', gap: '10px' }, logoBadge: { backgroundColor: COLORS.gold, color: COLORS.bg, width: '28px', height: '28px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  logoutBtn: { background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' },
  tabContainer: { display: 'flex', backgroundColor: COLORS.frame, borderBottom: `1px solid ${COLORS.border}`, overflowX: 'auto' },
  tabActive: { flex: 1, padding: '15px', backgroundColor: COLORS.bg, color: COLORS.gold, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: COLORS.gold, fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' },
  tabInactive: { flex: 1, padding: '15px', backgroundColor: 'transparent', color: COLORS.muted, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: 'transparent', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap', cursor: 'pointer' },
  content: { padding: '20px', maxWidth: '600px', margin: '0 auto' },
  searchForm: { marginBottom: '20px' }, searchWrapper: { display: 'flex', gap: '8px', backgroundColor: COLORS.cell, borderRadius: '6px', padding: '6px', border: `1px solid ${COLORS.border}` },
  input: { flex: 1, backgroundColor: 'transparent', border: 'none', color: COLORS.text, fontSize: '14px', padding: '10px', outline: 'none' }, searchBtn: { backgroundColor: COLORS.gold, color: COLORS.bg, border: 'none', borderRadius: '4px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  spinner: { width: '18px', height: '18px', border: `2px solid rgba(0,0,0,0.2)`, borderTop: `2px solid ${COLORS.bg}`, borderRadius: '50%', animation: 'spin 1s linear infinite' },
  errorBox: { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: COLORS.danger, padding: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', border: `1px solid ${COLORS.danger}` },
  
  listGrid: { display: 'flex', flexDirection: 'column', gap: '10px' }, miniCard: { backgroundColor: COLORS.frame, padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', border: `1px solid ${COLORS.border}`, cursor: 'pointer' },
  miniAvatar: { width: '36px', height: '36px', borderRadius: '18px', backgroundColor: COLORS.cell, color: COLORS.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  miniCardTitle: { margin: '0 0 2px 0', fontSize: '14px', color: COLORS.text, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }, miniCardSubtitle: { margin: '0 0 2px 0', fontSize: '12px', color: COLORS.muted },
  backBtn: { backgroundColor: 'transparent', color: COLORS.gold, border: 'none', cursor: 'pointer', marginBottom: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 },
  
  card: { backgroundColor: COLORS.frame, borderRadius: '8px', padding: '20px', border: `1px solid ${COLORS.border}`, boxShadow: '0 4px 15px rgba(0,0,0,0.3)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }, avatar: { width: '44px', height: '44px', borderRadius: '6px', backgroundColor: COLORS.cell, color: COLORS.gold, border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: COLORS.gold, margin: '0 0 4px 0', fontSize: '16px', fontWeight: 'bold' }, cardSubtitle: { color: COLORS.muted, margin: 0, fontSize: '12px' },
  statusRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  tagActive: { backgroundColor: 'transparent', color: COLORS.success, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.success}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' },
  tagInactive: { backgroundColor: 'transparent', color: COLORS.danger, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.danger}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' },
  tagUnlocked: { backgroundColor: 'transparent', color: COLORS.success, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.success}`, display: 'flex', alignItems: 'center', gap: '4px' }, tagLocked: { backgroundColor: 'transparent', color: COLORS.warning, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.warning}`, display: 'flex', alignItems: 'center', gap: '4px' },
  tagType: { backgroundColor: COLORS.cell, color: COLORS.muted, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.border}` },
  
  innerTabs: { display: 'flex', borderBottom: `1px solid ${COLORS.border}`, marginBottom: '15px', overflowX: 'auto' },
  innerTabActive: { backgroundColor: 'transparent', color: COLORS.gold, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: COLORS.gold, padding: '10px 15px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }, innerTabInactive: { backgroundColor: 'transparent', color: COLORS.muted, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: 'transparent', padding: '10px 15px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' },
  innerContent: { minHeight: '150px' }, detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  detailItem: { backgroundColor: COLORS.cell, padding: '10px', borderRadius: '6px', border: `1px solid ${COLORS.border}` }, detailItemFull: { gridColumn: '1 / -1', backgroundColor: COLORS.cell, padding: '10px', borderRadius: '6px', border: `1px solid ${COLORS.border}` },
  detailLabel: { display: 'block', color: COLORS.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold', letterSpacing: '0.5px' }, detailValue: { color: COLORS.text, fontSize: '12px', fontWeight: '500' }, detailValueMicro: { color: COLORS.muted, fontSize: '11px', wordBreak: 'break-all' },
  listContainer: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }, listItem: { backgroundColor: COLORS.cell, padding: '10px', borderRadius: '6px', fontSize: '12px', color: COLORS.text, border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center' },
  
  actionSection: { display: 'flex', flexDirection: 'column', gap: '15px' }, actionsGrid: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  gridBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: COLORS.cell, color: COLORS.text, border: `1px solid ${COLORS.border}`, padding: '10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', minWidth: '120px' },
  diagBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: 'transparent', color: '#38BDF8', border: `1px solid #38BDF8`, padding: '10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', minWidth: '120px', fontWeight: '600' },
  dangerZone: { borderTop: `1px solid ${COLORS.border}`, paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }, actionBtnWarning: { backgroundColor: 'transparent', color: COLORS.warning, border: `1px solid ${COLORS.warning}`, padding: '12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  resetContainer: { backgroundColor: COLORS.cell, padding: '15px', borderRadius: '6px', border: `1px solid ${COLORS.border}` }, sectionLabel: { color: COLORS.gold, fontSize: '11px', margin: '0 0 10px 0', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }, resetRow: { display: 'flex', gap: '10px' },
  inputReset: { flex: 1, backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '10px', borderRadius: '4px', outline: 'none', fontSize: '13px' }, actionBtnSuccess: { backgroundColor: COLORS.success, color: COLORS.bg, border: 'none', padding: '0 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' },
  groupsBox: { backgroundColor: COLORS.cell, padding: '12px', borderRadius: '6px', border: `1px solid ${COLORS.border}` }, groupItem: { color: COLORS.muted, fontSize: '12px', marginBottom: '6px', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '6px' }, hintText: { color: COLORS.muted, fontSize: '12px' },
  
  textArea: { width: '100%', height: '120px', backgroundColor: COLORS.cell, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '12px', borderRadius: '6px', boxSizing: 'border-box', marginTop: '10px', resize: 'vertical', outline: 'none', fontSize: '13px' },
  bulkActionsGrid: { display: 'flex', gap: '10px', marginTop: '15px' }, bulkBtnUnlock: { flex: 1, backgroundColor: 'transparent', color: COLORS.warning, border: `1px solid ${COLORS.warning}`, padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }, bulkBtnEnable: { flex: 1, backgroundColor: 'transparent', color: COLORS.success, border: `1px solid ${COLORS.success}`, padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }, bulkBtnDisable: { flex: 1, backgroundColor: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}`, padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  bulkResultBox: { backgroundColor: COLORS.cell, padding: '15px', borderRadius: '6px', marginTop: '20px', border: `1px solid ${COLORS.border}` },
  
  commonBox: { backgroundColor: 'transparent', padding: '15px', borderRadius: '6px', border: `1px solid ${COLORS.success}` },
  diffGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }, diffCard: { backgroundColor: COLORS.cell, padding: '15px', borderRadius: '6px', border: `1px solid ${COLORS.gold}`, display: 'flex', flexDirection: 'column' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 17, 30, 0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalContent: { backgroundColor: COLORS.frame, padding: '25px', borderRadius: '8px', width: '100%', maxWidth: '400px', border: `1px solid ${COLORS.border}` },
  modalInput: { width: '100%', backgroundColor: COLORS.cell, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '10px', borderRadius: '4px', boxSizing: 'border-box', outline: 'none', fontSize: '13px' },
  modalSelect: { width: '100%', backgroundColor: COLORS.cell, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '10px', borderRadius: '4px', marginTop: '10px', outline: 'none', fontSize: '13px' },
  modalActions: { display: 'flex', gap: '10px', marginTop: '25px' }, modalCancelBtn: { flex: 1, padding: '10px', backgroundColor: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }, modalSaveBtn: { flex: 1, padding: '10px', backgroundColor: COLORS.gold, color: COLORS.bg, border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }
};
const styleSheet = document.createElement("style"); styleSheet.innerText = `@keyframes spin { 100% { transform: rotate(360deg); } }`; document.head.appendChild(styleSheet);