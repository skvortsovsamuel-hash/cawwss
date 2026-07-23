import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NGOPending from "./pages/NGOPending";
import Opportunities from "./pages/Opportunities";
import OpportunityDetail from "./pages/OpportunityDetail";
import StudentDashboard from "./pages/StudentDashboard";
import StudentProfile from "./pages/StudentProfile";
import Messages from "./pages/Messages";
import Settings from "./pages/Settings";
import NGODashboard from "./pages/NGODashboard";
import NGOProfile from "./pages/NGOProfile";
import AdminDashboard from "./pages/AdminDashboard";
import Notifications from "./pages/Notifications";
import VerifyEmail from "./pages/VerifyEmail";
import AuthCallback from "./pages/AuthCallback";
import VerifyBanner from "./components/VerifyBanner";

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace/>;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace/>;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" richColors/>
      <BrowserRouter>
        <VerifyBanner/>
        <Routes>
          <Route path="/" element={<Landing/>}/>
          <Route path="/login" element={<Login/>}/>
          <Route path="/signup" element={<Signup/>}/>
          <Route path="/verify-email" element={<VerifyEmail/>}/>
          <Route path="/auth/callback" element={<AuthCallback/>}/>
          <Route path="/opportunities" element={<Opportunities/>}/>
          <Route path="/opportunities/:id" element={<OpportunityDetail/>}/>
          <Route path="/ngos/:id" element={<NGOProfile/>}/>
          <Route path="/students/:id" element={<StudentProfile/>}/>
          <Route path="/ngo/pending" element={<Protected roles={["ngo"]}><NGOPending/></Protected>}/>
          <Route path="/student" element={<Protected roles={["student"]}><StudentDashboard/></Protected>}/>
          <Route path="/ngo" element={<Protected roles={["ngo"]}><NGODashboard/></Protected>}/>
          <Route path="/admin" element={<Protected roles={["admin"]}><AdminDashboard/></Protected>}/>
          <Route path="/notifications" element={<Protected><Notifications/></Protected>}/>
          <Route path="/messages" element={<Protected><Messages/></Protected>}/>
          <Route path="/settings" element={<Protected><Settings/></Protected>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
