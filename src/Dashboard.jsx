import React, { useEffect, useMemo, useState } from "react";
import api from "./api";
import { toInputDate, formatDate, formatDateTime, daysUntil, DEFAULT_DATE_FORMAT } from "./utils";

const emptyForm = {
  partyName: "",
  firmName: "",
  userId: "",
  password: "",
  mobileNo: "",
  emailId: "",
  licenseNumber: "",
  licenseType: "",
  clientNumber: "",
  designation: "",
  kob: "",
  expiredDate: "",
  expiredDateFormat: DEFAULT_DATE_FORMAT
};

// Fallback lists — used only if GET /api/clients/options hasn't resolved yet
// or fails. The backend's list is authoritative and overrides these.
const FALLBACK_OPTIONS = {
  licenseType: ["State License", "Central License", "Registration", "Basic Registration"],
  designation: ["PROPRIETOR", "PARTNER", "LLP/PARTNER", "DIRECTOR", "COMPANY", "AUTHORIZED SIGNATORY", "KARTA"],
  kob: [
    "Retailer",
    "Wholesaler",
    "Distributor",
    "Distributor/Wholesaler",
    "Retailer/Wholesaler",
    "Retail/Wholesaler",
    "Manufacturer",
    "Importer",
    "Exporter",
    "Supplier",
    "Marketer",
    "Importer/Wholesaler/Distributor/Retailer/Supplier/Marketer/Exporter",
    "Food Service- Restaurant",
    "Hotel"
  ]
};

export default function Dashboard({ username, onLogout }) {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [options, setOptions] = useState(FALLBACK_OPTIONS);

  const [form, setForm] = useState(emptyForm);
  const [editingClient, setEditingClient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState("");

  const [renewTarget, setRenewTarget] = useState(null); // client being renewed
  const [renewDate, setRenewDate] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState("");

  const [revealedPasswords, setRevealedPasswords] = useState({});

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  async function load() {
    try {
      setLoading(true);
      setLoadError("");
      const { data } = await api.get("/clients", { params: { search } });
      setClients(data);
    } catch (e) {
      setLoadError(e.response?.data?.message || "Could not load clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { load().catch(() => {}); }, 250); // debounce search
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Load the canonical dropdown options once. If the call fails, keep the
  // built-in fallbacks so the form still functions.
  useEffect(() => {
    api.get("/clients/options")
      .then(({ data }) => {
        setOptions({
          licenseType: data.licenseType?.length ? data.licenseType : FALLBACK_OPTIONS.licenseType,
          designation: data.designation?.length ? data.designation : FALLBACK_OPTIONS.designation,
          kob: data.kob?.length ? data.kob : FALLBACK_OPTIONS.kob
        });
      })
      .catch(() => { /* keep fallbacks */ });
  }, []);

  function openCreate() {
    setEditingClient(null);
    setForm({ ...emptyForm });
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(client) {
    setEditingClient(client);
    setFormError("");
    setModalOpen(true);
    setForm({
      partyName: client.partyName || "",
      firmName: client.firmName || "",
      userId: client.userId || "",
      password: client.password || "",
      mobileNo: client.mobileNo || "",
      emailId: client.emailId || "",
      licenseNumber: client.licenseNumber || "",
      licenseType: client.licenseType || "",
      clientNumber: client.clientNumber || "",
      designation: client.designation || "",
      kob: client.kob || "",
      expiredDate: toInputDate(client.expiredDate),
      expiredDateFormat: client.expiredDateFormat || DEFAULT_DATE_FORMAT
    });
  }

  async function saveClient(e) {
    e.preventDefault();
    setFormError("");
    if (!form.partyName.trim()) return setFormError("Party name is required.");
    if (!form.expiredDate) return setFormError("Expired date is required.");

    try {
      setSaving(true);
      if (editingClient) {
        await api.put(`/clients/${editingClient._id}`, form);
      } else {
        await api.post("/clients", form);
      }
      setModalOpen(false);
      setEditingClient(null);
      setForm({ ...emptyForm });
      await load();
    } catch (err) {
      setFormError(err.response?.data?.message || "Could not save client.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient(client) {
    if (!window.confirm(`Delete ${client.partyName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/clients/${client._id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || "Could not delete client.");
    }
  }

  function openRenew(client) {
    setRenewTarget(client);
    setRenewError("");
    // Suggest one year ahead of the current expired date as a starting point.
    const current = client.expiredDate ? new Date(client.expiredDate) : new Date();
    const suggested = new Date(current);
    suggested.setFullYear(suggested.getFullYear() + 1);
    setRenewDate(toInputDate(suggested));
  }

  async function confirmRenew(e) {
    e.preventDefault();
    if (!renewTarget) return;
    setRenewError("");
    try {
      setRenewing(true);
      // "Last Renewed At" is stamped automatically by the server the instant
      // this request is made — it is never something typed in manually.
      await api.post(`/clients/${renewTarget._id}/renew`, {
        newExpiredDate: renewDate || undefined
      });
      setRenewTarget(null);
      await load();
    } catch (err) {
      setRenewError(err.response?.data?.message || "Renewal failed.");
    } finally {
      setRenewing(false);
    }
  }

  async function exportExcel() {
    try {
      const response = await api.get("/export/excel", { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clients.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || "Excel export failed.");
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (pwForm.newPassword.length < 6) return setPwError("New password must be at least 6 characters.");
    if (pwForm.newPassword !== pwForm.confirmPassword) return setPwError("New passwords do not match.");
    try {
      setPwSaving(true);
      await api.post("/auth/change-password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword
      });
      setPwSuccess("Password updated successfully.");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPwError(err.response?.data?.message || "Could not change password.");
    } finally {
      setPwSaving(false);
    }
  }

  function togglePasswordVisibility(id) {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const stats = useMemo(() => {
    const total = clients.length;
    const expiringSoon = clients.filter((c) => {
      const d = daysUntil(c.expiredDate);
      return d !== null && d <= 15 && d >= 0;
    }).length;
    const expired = clients.filter((c) => {
      const d = daysUntil(c.expiredDate);
      return d !== null && d < 0;
    }).length;
    return { total, expiringSoon, expired };
  }, [clients]);

  function statusFor(client) {
    const d = daysUntil(client.expiredDate);
    if (d === null) return { label: "Unknown", cls: "" };
    if (d < 0) return { label: `Expired ${Math.abs(d)}d ago`, cls: "danger" };
    if (d <= 15) return { label: `${d}d left`, cls: "warning" };
    return { label: "Active", cls: "success" };
  }

  return (
    <main>
      <header>
        <div>
          <h1>Client Renewal Management</h1>
          <p>Add, update &amp; delete client record.</p>
        </div>
        <div className="header-right">
          <div className="stats">
            <div><strong>{stats.total}</strong><span>Total</span></div>
            <div><strong className="warn">{stats.expiringSoon}</strong><span>Expiring ≤15d</span></div>
            <div><strong className="danger">{stats.expired}</strong><span>Expired</span></div>
          </div>
          <div className="user-menu">
            <span className="user-pill">👤 {username}</span>
            <button className="warning" onClick={() => { setPwError(""); setPwSuccess(""); setPwModalOpen(true); }}>
              Change Password
            </button>
            <button className="danger" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </header>

      <section className="toolbar">
        <input
          placeholder="Search party, firm, user id, mobile, email, license or client no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="export-excel" onClick={exportExcel}>⬇ Export Excel</button>
        <button onClick={openCreate}>+ Add Client</button>
      </section>

      {loadError && <div className="error-banner">{loadError}</div>}

      <section className="card">
        <table>
          <thead>
            <tr>
              <th>Party Name</th>
              <th>Firm Name</th>
              <th>Credentials</th>
              <th>Mobile No.</th>
              <th>Email</th>
              <th>License Number</th>
              <th>License Type</th>
              <th>Client Number</th>
              <th>Designation</th>
              <th>K.O.B</th>
              <th>Expired Date</th>
              <th>Last Renewed At</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="14" className="empty">Loading...</td></tr>
            )}
            {!loading && clients.map((c) => {
              const status = statusFor(c);
              const revealed = !!revealedPasswords[c._id];
              return (
                <tr key={c._id}>
                  <td><b>{c.partyName}</b></td>
                  <td>{c.firmName || "-"}</td>
                  <td className="credentials-cell">
                    <div><small>ID:</small> {c.userId || "-"}</div>
                    <div>
                      <small>Pwd:</small> {c.password ? (revealed ? c.password : "••••••••") : "-"}
                      {c.password && (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => togglePasswordVisibility(c._id)}
                        >
                          {revealed ? "Hide" : "Show"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td>{c.mobileNo || "-"}</td>
                  <td>{c.emailId || "-"}</td>
                  <td>{c.licenseNumber || "-"}</td>
                  <td>{c.licenseType || "-"}</td>
                  <td>{c.clientNumber || "-"}</td>
                  <td>{c.designation || "-"}</td>
                  <td>{c.kob || "-"}</td>
                  <td>{formatDate(c.expiredDate, c.expiredDateFormat)}</td>
                  <td>{c.lastRenewedAt ? formatDateTime(c.lastRenewedAt) : "Never"}</td>
                  <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
                  <td className="actions-cell">
                    <button onClick={() => openEdit(c)}>Edit</button>
                    <button className="success" onClick={() => openRenew(c)}>Renew</button>
                    <button className="danger" onClick={() => deleteClient(c)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {!loading && !clients.length && (
              <tr><td colSpan="14" className="empty">No clients found. Click "+ Add Client" to add one manually.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Add / Edit Client modal */}
      {modalOpen && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <form className="modal wide" onSubmit={saveClient}>
            <h2>{editingClient ? "Edit Client" : "Add Client"}</h2>
            {formError && <div className="error-banner">{formError}</div>}

            <div className="form-grid">
              <div>
                <label>Party Name *</label>
                <input value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} required />
              </div>
              <div>
                <label>Firm Name</label>
                <input value={form.firmName} onChange={(e) => setForm({ ...form, firmName: e.target.value })} />
              </div>

              <div>
                <label>User ID</label>
                <input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
              </div>
              <div>
                <label>Password</label>
                <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>

              <div>
                <label>Mobile No.</label>
                <input
                  value={form.mobileNo}
                  onChange={(e) => setForm({ ...form, mobileNo: e.target.value })}
                  placeholder="Multiple numbers separated by commas"
                />
              </div>
              <div>
                <label>Email.Id</label>
                <input type="email" value={form.emailId} onChange={(e) => setForm({ ...form, emailId: e.target.value })} />
              </div>

              <div>
                <label>License Number</label>
                <input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
              </div>
              <div>
                <label>License Type</label>
                <input list="license-type-options" value={form.licenseType}
                  onChange={(e) => setForm({ ...form, licenseType: e.target.value })} />
                <datalist id="license-type-options">
                  {options.licenseType.map((o) => <option key={o} value={o} />)}
                </datalist>
              </div>

              <div>
                <label>Client Number</label>
                <input value={form.clientNumber} onChange={(e) => setForm({ ...form, clientNumber: e.target.value })} />
              </div>
              <div>
                <label>Designation</label>
                <input list="designation-options" value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                <datalist id="designation-options">
                  {options.designation.map((o) => <option key={o} value={o} />)}
                </datalist>
              </div>

              <div>
                <label>K.O.B</label>
                <input list="kob-options" value={form.kob}
                  onChange={(e) => setForm({ ...form, kob: e.target.value })} />
                <datalist id="kob-options">
                  {options.kob.map((o) => <option key={o} value={o} />)}
                </datalist>
              </div>
              <div>
                <label>Expired Date *</label>
                <div className="date-with-format">
                  <input type="date" value={form.expiredDate}
                    onChange={(e) => setForm({ ...form, expiredDate: e.target.value })} required />
                  <select value={form.expiredDateFormat}
                    onChange={(e) => setForm({ ...form, expiredDateFormat: e.target.value })}>
                    <option>dd-mm-yyyy</option>
                    <option>dd/mm/yyyy</option>
                    <option>yyyy-mm-dd</option>
                  </select>
                </div>
              </div>
            </div>

            {editingClient && (
              <p className="hint">
                Last Renewed At: <b>{editingClient.lastRenewedAt ? formatDateTime(editingClient.lastRenewedAt) : "Never"}</b>{" "}
                — this is set automatically only when the Renew button is used, and can't be edited here.
              </p>
            )}

            <div className="actions">
              <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Client"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Renew modal */}
      {renewTarget && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setRenewTarget(null); }}>
          <form className="modal" onSubmit={confirmRenew}>
            <h2>Renew {renewTarget.partyName}</h2>
            {renewError && <div className="error-banner">{renewError}</div>}

            <label>New Expired Date (optional — leave as is to keep the current date)</label>
            <input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} />

            {/* <p className="hint">
              "Last Renewed At" will be set to the current date &amp; time automatically the moment you confirm.
            </p> */}

            <div className="actions">
              <button type="button" className="secondary" onClick={() => setRenewTarget(null)}>Cancel</button>
              <button type="submit" className="success" disabled={renewing}>
                {renewing ? "Renewing..." : "Confirm Renew"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change password modal */}
      {pwModalOpen && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPwModalOpen(false); }}>
          <form className="modal" onSubmit={changePassword}>
            <h2>Change Password</h2>
            {pwError && <div className="error-banner">{pwError}</div>}
            {pwSuccess && <div className="success-banner">{pwSuccess}</div>}

            <label>Current Password</label>
            <input type="password" value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required />

            <label>New Password</label>
            <input type="password" value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required minLength={6} />

            <label>Confirm New Password</label>
            <input type="password" value={pwForm.confirmPassword}
              onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} required minLength={6} />

            <div className="actions">
              <button type="button" className="secondary" onClick={() => setPwModalOpen(false)}>Close</button>
              <button type="submit" disabled={pwSaving}>{pwSaving ? "Saving..." : "Update Password"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}



// import React, { useEffect, useMemo, useState } from "react";
// import api from "./api";
// import { toInputDate, formatDate, formatDateTime, daysUntil, DEFAULT_DATE_FORMAT } from "./utils";

// const emptyForm = {
//   partyName: "",
//   firmName: "",
//   userId: "",
//   password: "",
//   mobileNo: "",
//   emailId: "",
//   licenseNumber: "",
//   licenseType: "",
//   clientNumber: "",
//   designation: "",
//   kob: "",
//   expiredDate: "",
//   expiredDateFormat: DEFAULT_DATE_FORMAT
// };

// const LICENSE_TYPE_OPTIONS = ["State License", "Central License", "Basic Registration"];
// const DESIGNATION_OPTIONS = ["PROPRIETOR", "PARTNER", "DIRECTOR", "AUTHORIZED SIGNATORY", "KARTA"];
// const KOB_OPTIONS = ["Retailer", "Wholesaler", "Distributor/Wholesaler", "Manufacturer", "Importer", "Exporter"];

// export default function Dashboard({ username, onLogout }) {
//   const [clients, setClients] = useState([]);
//   const [search, setSearch] = useState("");
//   const [loading, setLoading] = useState(false);
//   const [loadError, setLoadError] = useState("");

//   const [form, setForm] = useState(emptyForm);
//   const [editingClient, setEditingClient] = useState(null);
//   const [saving, setSaving] = useState(false);
//   const [modalOpen, setModalOpen] = useState(false);
//   const [formError, setFormError] = useState("");

//   const [renewTarget, setRenewTarget] = useState(null); // client being renewed
//   const [renewDate, setRenewDate] = useState("");
//   const [renewing, setRenewing] = useState(false);
//   const [renewError, setRenewError] = useState("");

//   const [revealedPasswords, setRevealedPasswords] = useState({});

//   const [pwModalOpen, setPwModalOpen] = useState(false);
//   const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
//   const [pwSaving, setPwSaving] = useState(false);
//   const [pwError, setPwError] = useState("");
//   const [pwSuccess, setPwSuccess] = useState("");

//   async function load() {
//     try {
//       setLoading(true);
//       setLoadError("");
//       const { data } = await api.get("/clients", { params: { search } });
//       setClients(data);
//     } catch (e) {
//       setLoadError(e.response?.data?.message || "Could not load clients.");
//     } finally {
//       setLoading(false);
//     }
//   }

//   useEffect(() => {
//     const timer = setTimeout(() => { load().catch(() => {}); }, 250); // debounce search
//     return () => clearTimeout(timer);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [search]);

//   function openCreate() {
//     setEditingClient(null);
//     setForm({ ...emptyForm });
//     setFormError("");
//     setModalOpen(true);
//   }

//   function openEdit(client) {
//     setEditingClient(client);
//     setFormError("");
//     setModalOpen(true);
//     setForm({
//       partyName: client.partyName || "",
//       firmName: client.firmName || "",
//       userId: client.userId || "",
//       password: client.password || "",
//       mobileNo: client.mobileNo || "",
//       emailId: client.emailId || "",
//       licenseNumber: client.licenseNumber || "",
//       licenseType: client.licenseType || "",
//       clientNumber: client.clientNumber || "",
//       designation: client.designation || "",
//       kob: client.kob || "",
//       expiredDate: toInputDate(client.expiredDate),
//       expiredDateFormat: client.expiredDateFormat || DEFAULT_DATE_FORMAT
//     });
//   }

//   async function saveClient(e) {
//     e.preventDefault();
//     setFormError("");
//     if (!form.partyName.trim()) return setFormError("Party name is required.");
//     if (!form.expiredDate) return setFormError("Expired date is required.");

//     try {
//       setSaving(true);
//       if (editingClient) {
//         await api.put(`/clients/${editingClient._id}`, form);
//       } else {
//         await api.post("/clients", form);
//       }
//       setModalOpen(false);
//       setEditingClient(null);
//       setForm({ ...emptyForm });
//       await load();
//     } catch (err) {
//       setFormError(err.response?.data?.message || "Could not save client.");
//     } finally {
//       setSaving(false);
//     }
//   }

//   async function deleteClient(client) {
//     if (!window.confirm(`Delete ${client.partyName}? This cannot be undone.`)) return;
//     try {
//       await api.delete(`/clients/${client._id}`);
//       await load();
//     } catch (err) {
//       alert(err.response?.data?.message || "Could not delete client.");
//     }
//   }

//   function openRenew(client) {
//     setRenewTarget(client);
//     setRenewError("");
//     // Suggest one year ahead of the current expired date as a starting point.
//     const current = client.expiredDate ? new Date(client.expiredDate) : new Date();
//     const suggested = new Date(current);
//     suggested.setFullYear(suggested.getFullYear() + 1);
//     setRenewDate(toInputDate(suggested));
//   }

//   async function confirmRenew(e) {
//     e.preventDefault();
//     if (!renewTarget) return;
//     setRenewError("");
//     try {
//       setRenewing(true);
//       // "Last Renewed At" is stamped automatically by the server the instant
//       // this request is made — it is never something typed in manually.
//       await api.post(`/clients/${renewTarget._id}/renew`, {
//         newExpiredDate: renewDate || undefined
//       });
//       setRenewTarget(null);
//       await load();
//     } catch (err) {
//       setRenewError(err.response?.data?.message || "Renewal failed.");
//     } finally {
//       setRenewing(false);
//     }
//   }

//   async function exportExcel() {
//     try {
//       const response = await api.get("/export/excel", { responseType: "blob" });
//       const url = URL.createObjectURL(response.data);
//       const a = document.createElement("a");
//       a.href = url;
//       a.download = "clients.xlsx";
//       a.click();
//       URL.revokeObjectURL(url);
//     } catch (err) {
//       alert(err.response?.data?.message || "Excel export failed.");
//     }
//   }

//   async function changePassword(e) {
//     e.preventDefault();
//     setPwError("");
//     setPwSuccess("");
//     if (pwForm.newPassword.length < 6) return setPwError("New password must be at least 6 characters.");
//     if (pwForm.newPassword !== pwForm.confirmPassword) return setPwError("New passwords do not match.");
//     try {
//       setPwSaving(true);
//       await api.post("/auth/change-password", {
//         currentPassword: pwForm.currentPassword,
//         newPassword: pwForm.newPassword
//       });
//       setPwSuccess("Password updated successfully.");
//       setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
//     } catch (err) {
//       setPwError(err.response?.data?.message || "Could not change password.");
//     } finally {
//       setPwSaving(false);
//     }
//   }

//   function togglePasswordVisibility(id) {
//     setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
//   }

//   const stats = useMemo(() => {
//     const total = clients.length;
//     const expiringSoon = clients.filter((c) => {
//       const d = daysUntil(c.expiredDate);
//       return d !== null && d <= 15 && d >= 0;
//     }).length;
//     const expired = clients.filter((c) => {
//       const d = daysUntil(c.expiredDate);
//       return d !== null && d < 0;
//     }).length;
//     return { total, expiringSoon, expired };
//   }, [clients]);

//   function statusFor(client) {
//     const d = daysUntil(client.expiredDate);
//     if (d === null) return { label: "Unknown", cls: "" };
//     if (d < 0) return { label: `Expired ${Math.abs(d)}d ago`, cls: "danger" };
//     if (d <= 15) return { label: `${d}d left`, cls: "warning" };
//     return { label: "Active", cls: "success" };
//   }

//   return (
//     <main>
//       <header>
//         <div>
//           <h1>Client Renewal Management</h1>
//           <p>Add, update & delete client record.</p>
//         </div>
//         <div className="header-right">
//           <div className="stats">
//             <div><strong>{stats.total}</strong><span>Total</span></div>
//             <div><strong className="warn">{stats.expiringSoon}</strong><span>Expiring ≤15d</span></div>
//             <div><strong className="danger">{stats.expired}</strong><span>Expired</span></div>
//           </div>
//           <div className="user-menu">
//             <span className="user-pill">👤 {username}</span>
//             <button className="secondary" onClick={() => { setPwError(""); setPwSuccess(""); setPwModalOpen(true); }}>
//               Change Password
//             </button>
//             <button className="secondary" onClick={onLogout}>Logout</button>
//           </div>
//         </div>
//       </header>

//       <section className="toolbar">
//         <input
//           placeholder="Search party, firm, mobile, email, license or client no..."
//           value={search}
//           onChange={(e) => setSearch(e.target.value)}
//         />
//         <button className="secondary" onClick={exportExcel}>⬇ Export Excel</button>
//         <button onClick={openCreate}>+ Add Client</button>
//       </section>

//       {loadError && <div className="error-banner">{loadError}</div>}

//       <section className="card">
//         <table>
//           <thead>
//             <tr>
//               <th>Party Name</th>
//               <th>Firm Name</th>
//               <th>Credentials</th>
//               <th>Mobile No.</th>
//               <th>Email</th>
//               <th>License Number</th>
//               <th>License Type</th>
//               <th>Client Number</th>
//               <th>Designation</th>
//               <th>K.O.B</th>
//               <th>Expired Date</th>
//               <th>Last Renewed At</th>
//               <th>Status</th>
//               <th>Action</th>
//             </tr>
//           </thead>
//           <tbody>
//             {loading && (
//               <tr><td colSpan="14" className="empty">Loading...</td></tr>
//             )}
//             {!loading && clients.map((c) => {
//               const status = statusFor(c);
//               const revealed = !!revealedPasswords[c._id];
//               return (
//                 <tr key={c._id}>
//                   <td><b>{c.partyName}</b></td>
//                   <td>{c.firmName || "-"}</td>
//                   <td className="credentials-cell">
//                     <div><small>ID:</small> {c.userId || "-"}</div>
//                     <div>
//                       <small>Pwd:</small> {c.password ? (revealed ? c.password : "••••••••") : "-"}
//                       {c.password && (
//                         <button
//                           type="button"
//                           className="link-btn"
//                           onClick={() => togglePasswordVisibility(c._id)}
//                         >
//                           {revealed ? "Hide" : "Show"}
//                         </button>
//                       )}
//                     </div>
//                   </td>
//                   <td>{c.mobileNo || "-"}</td>
//                   <td>{c.emailId || "-"}</td>
//                   <td>{c.licenseNumber || "-"}</td>
//                   <td>{c.licenseType || "-"}</td>
//                   <td>{c.clientNumber || "-"}</td>
//                   <td>{c.designation || "-"}</td>
//                   <td>{c.kob || "-"}</td>
//                   <td>{formatDate(c.expiredDate, c.expiredDateFormat)}</td>
//                   <td>{c.lastRenewedAt ? formatDateTime(c.lastRenewedAt) : "Never"}</td>
//                   <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
//                   <td className="actions-cell">
//                     <button onClick={() => openEdit(c)}>Edit</button>
//                     <button className="success" onClick={() => openRenew(c)}>Renew</button>
//                     <button className="danger" onClick={() => deleteClient(c)}>Delete</button>
//                   </td>
//                 </tr>
//               );
//             })}
//             {!loading && !clients.length && (
//               <tr><td colSpan="14" className="empty">No clients found. Click "+ Add Client" to add one manually.</td></tr>
//             )}
//           </tbody>
//         </table>
//       </section>

//       {/* Add / Edit Client modal */}
//       {modalOpen && (
//         <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
//           <form className="modal wide" onSubmit={saveClient}>
//             <h2>{editingClient ? "Edit Client" : "Add Client"}</h2>
//             {formError && <div className="error-banner">{formError}</div>}

//             <div className="form-grid">
//               <div>
//                 <label>Party Name *</label>
//                 <input value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} required />
//               </div>
//               <div>
//                 <label>Firm Name</label>
//                 <input value={form.firmName} onChange={(e) => setForm({ ...form, firmName: e.target.value })} />
//               </div>

//               <div>
//                 <label>User ID</label>
//                 <input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
//               </div>
//               <div>
//                 <label>Password</label>
//                 <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
//               </div>

//               <div>
//                 <label>Mobile No.</label>
//                 <input value={form.mobileNo} onChange={(e) => setForm({ ...form, mobileNo: e.target.value })} />
//               </div>
//               <div>
//                 <label>Email.Id</label>
//                 <input type="email" value={form.emailId} onChange={(e) => setForm({ ...form, emailId: e.target.value })} />
//               </div>

//               <div>
//                 <label>License Number</label>
//                 <input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
//               </div>
//               <div>
//                 <label>License Type</label>
//                 <input list="license-type-options" value={form.licenseType}
//                   onChange={(e) => setForm({ ...form, licenseType: e.target.value })} />
//                 <datalist id="license-type-options">
//                   {LICENSE_TYPE_OPTIONS.map((o) => <option key={o} value={o} />)}
//                 </datalist>
//               </div>

//               <div>
//                 <label>Client Number</label>
//                 <input value={form.clientNumber} onChange={(e) => setForm({ ...form, clientNumber: e.target.value })} />
//               </div>
//               <div>
//                 <label>Designation</label>
//                 <input list="designation-options" value={form.designation}
//                   onChange={(e) => setForm({ ...form, designation: e.target.value })} />
//                 <datalist id="designation-options">
//                   {DESIGNATION_OPTIONS.map((o) => <option key={o} value={o} />)}
//                 </datalist>
//               </div>

//               <div>
//                 <label>K.O.B</label>
//                 <input list="kob-options" value={form.kob}
//                   onChange={(e) => setForm({ ...form, kob: e.target.value })} />
//                 <datalist id="kob-options">
//                   {KOB_OPTIONS.map((o) => <option key={o} value={o} />)}
//                 </datalist>
//               </div>
//               <div>
//                 <label>Expired Date *</label>
//                 <div className="date-with-format">
//                   <input type="date" value={form.expiredDate}
//                     onChange={(e) => setForm({ ...form, expiredDate: e.target.value })} required />
//                   <select value={form.expiredDateFormat}
//                     onChange={(e) => setForm({ ...form, expiredDateFormat: e.target.value })}>
//                     <option>dd-mm-yyyy</option>
//                     <option>dd/mm/yyyy</option>
//                     <option>yyyy-mm-dd</option>
//                   </select>
//                 </div>
//               </div>
//             </div>

//             {editingClient && (
//               <p className="hint">
//                 Last Renewed At: <b>{editingClient.lastRenewedAt ? formatDateTime(editingClient.lastRenewedAt) : "Never"}</b>{" "}
//                 — this is set automatically only when the Renew button is used, and can't be edited here.
//               </p>
//             )}

//             <div className="actions">
//               <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancel</button>
//               <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Client"}</button>
//             </div>
//           </form>
//         </div>
//       )}

//       {/* Renew modal */}
//       {renewTarget && (
//         <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setRenewTarget(null); }}>
//           <form className="modal" onSubmit={confirmRenew}>
//             <h2>Renew {renewTarget.partyName}</h2>
//             {renewError && <div className="error-banner">{renewError}</div>}

//             <label>New Expired Date (optional — leave as is to keep the current date)</label>
//             <input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} />

//             <p className="hint">
//               "Last Renewed At" will be set to the current date &amp; time automatically the moment you confirm.
//             </p>

//             <div className="actions">
//               <button type="button" className="secondary" onClick={() => setRenewTarget(null)}>Cancel</button>
//               <button type="submit" className="success" disabled={renewing}>
//                 {renewing ? "Renewing..." : "Confirm Renew"}
//               </button>
//             </div>
//           </form>
//         </div>
//       )}

//       {/* Change password modal */}
//       {pwModalOpen && (
//         <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPwModalOpen(false); }}>
//           <form className="modal" onSubmit={changePassword}>
//             <h2>Change Password</h2>
//             {pwError && <div className="error-banner">{pwError}</div>}
//             {pwSuccess && <div className="success-banner">{pwSuccess}</div>}

//             <label>Current Password</label>
//             <input type="password" value={pwForm.currentPassword}
//               onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required />

//             <label>New Password</label>
//             <input type="password" value={pwForm.newPassword}
//               onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required minLength={6} />

//             <label>Confirm New Password</label>
//             <input type="password" value={pwForm.confirmPassword}
//               onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} required minLength={6} />

//             <div className="actions">
//               <button type="button" className="secondary" onClick={() => setPwModalOpen(false)}>Close</button>
//               <button type="submit" disabled={pwSaving}>{pwSaving ? "Saving..." : "Update Password"}</button>
//             </div>
//           </form>
//         </div>
//       )}
//     </main>
//   );
// }