import React, { useEffect, useState } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";

export default function App() {
  const [username, setUsername] = useState(() => localStorage.getItem("crm_username") || "");
  const [token, setToken] = useState(() => localStorage.getItem("crm_token") || "");

  useEffect(() => {
    function handleForcedLogout() {
      setToken("");
      setUsername("");
    }
    window.addEventListener("auth:logout", handleForcedLogout);
    return () => window.removeEventListener("auth:logout", handleForcedLogout);
  }, []);

  function handleLoggedIn(name) {
    setUsername(name);
    setToken(localStorage.getItem("crm_token") || "");
  }

  function handleLogout() {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_username");
    setToken("");
    setUsername("");
  }

  if (!token) {
    return <Login onLoggedIn={handleLoggedIn} />;
  }

  return <Dashboard username={username} onLogout={handleLogout} />;
}
