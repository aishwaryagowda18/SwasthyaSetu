import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { RequireAdmin, useAdmin } from "./session";

export default function AdminLayout() {
  const { session, signOut, can } = useAdmin();
  const navigate = useNavigate();
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-semibold ${isActive ? "bg-navy text-white" : "text-navy hover:bg-muted"}`;
  return (
    <RequireAdmin>
      <div className="container-tight px-4 md:px-6 py-8 space-y-6">
        <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
          <nav className="flex flex-wrap gap-2" aria-label="Admin">
            <NavLink to="/admin" end className={tab}>Schemes</NavLink>
            <NavLink to="/admin/sources" className={tab}>Source domains</NavLink>
            {can("audit") && <NavLink to="/admin/audit" className={tab}>Audit log</NavLink>}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span>
              Signed in as <strong>{session?.user.display_name}</strong>{" "}
              <span className="badge capitalize">{session?.user.role}</span>
            </span>
            <button className="btn btn-outline py-2 px-3" onClick={async () => { await signOut(); navigate("/admin/login"); }}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
        <Outlet />
      </div>
    </RequireAdmin>
  );
}
