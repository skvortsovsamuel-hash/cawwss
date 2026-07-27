import axios from "axios";

// Support both absolute URLs and relative paths
// On Vercel, this will default to relative /api path if env var not set
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("caws_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const setAuth = (token, user) => {
  localStorage.setItem("caws_token", token);
  localStorage.setItem("caws_user", JSON.stringify(user));
};

export const clearAuth = () => {
  localStorage.removeItem("caws_token");
  localStorage.removeItem("caws_user");
};

export const getUser = () => {
  try { return JSON.parse(localStorage.getItem("caws_user")); } catch { return null; }
};

export const getToken = () => localStorage.getItem("caws_token");
