import axios from 'axios';

const api = axios.create({
  // O Vite se encarrega de repassar tudo que for /api para o Python
  baseURL: '/api' 
});

// O Interceptador: Pega o token salvo no login e cola no cabeçalho de toda nova requisição
api.interceptors.request.use(async config => {
  const token = localStorage.getItem('@kad_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;