// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // O FastAPI usa OAuth2 com formulário, então precisamos enviar como URL Encoded
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const response = await api.post('/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      // Salva o token no navegador
      localStorage.setItem('@kad_token', response.data.access_token);
      
      // Manda o usuário para a tela de busca
      navigate('/dashboard');
      
    } catch (err) {
      setError('Falha no login. Verifique suas credenciais.');
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <h2>KAD Mobile</h2>
      <form onSubmit={handleLogin} style={styles.form}>
        <input 
          type="text" 
          placeholder="Usuário" 
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={styles.input}
        />
        <input 
          type="password" 
          placeholder="Senha" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />
        {error && <p style={{color: 'red', fontSize: '14px'}}>{error}</p>}
        <button type="submit" style={styles.button}>Entrar</button>
      </form>
    </div>
  );
}

// Estilos básicos inline para o MVP (depois podemos melhorar com CSS)
const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#1a1a1a', color: 'white' },
  form: { display: 'flex', flexDirection: 'column', width: '300px', gap: '15px' },
  input: { padding: '10px', borderRadius: '5px', border: 'none' },
  button: { padding: '10px', backgroundColor: '#e2a829', color: 'black', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }
};