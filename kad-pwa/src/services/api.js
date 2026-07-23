import axios from 'axios';

const api = axios.create({
  // Use localhost se frontend e backend estiverem no mesmo computador
  baseURL: 'http://localhost:8080', 
});

// Interceptador: injeta o token antes de mandar a requisição para o Python
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('@kad_token');
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;