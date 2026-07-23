import {
  Activity,
  FolderKanban,
  LayoutDashboard,
  LogOut,
<<<<<<< HEAD
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
=======
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Button } from "@authenik8/ui";
>>>>>>> main
import { useAuth } from "../auth/AuthProvider";

const mainLinks = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/settings/profile", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { user, logout } = useAuth();
<<<<<<< HEAD
  const location = useLocation();
  const navigate = useNavigate();

  const navigateTo = (path: string) => () => navigate(path);
  const isSelected = (path: string, exact = false) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const sideNav = (
    <SideNav
      className="workspace-sidebar"
      footer={
        <div className="sidebar-account">
          <Avatar name={user?.name} size="medium" />
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
        </div>
      }
    >
      <SideNavSection title="Workspace">
        {mainLinks.map(({ icon: Icon, ...link }) => (
          <SideNavItem
            key={link.to}
            label={link.label}
            icon={<Icon size={18} />}
            isSelected={isSelected(link.to, link.end)}
            onClick={navigateTo(link.to)}
          />
        ))}
      </SideNavSection>
      {user?.role === "ADMIN" && (
        <SideNavSection title="Administration">
          <SideNavItem
            label="Users"
            icon={<Users size={18} />}
            isSelected={isSelected("/admin/users")}
            onClick={navigateTo("/admin/users")}
          />
          <SideNavItem
            label="Audit trail"
            icon={<Activity size={18} />}
            isSelected={isSelected("/admin/audit")}
            onClick={navigateTo("/admin/audit")}
          />
        </SideNavSection>
      )}
    </SideNav>
  );

  const topNav = (
    <TopNav
      className="workspace-topbar"
      label="Workspace navigation"
      heading={
        <TopNavHeading
          logo={<img className="brand-logo" src="/authenik8-logo.svg" alt="" />}
          heading="Authenik8"
          subheading="Workspace"
        />
      }
      startContent={
        <div className="current-section">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>{titleForPath(location.pathname)}</span>
        </div>
      }
      endContent={
        <Button
          label="Sign out"
          variant="ghost"
          size="sm"
          icon={<LogOut size={17} />}
          onClick={() => void logout()}
        />
      }
    />
  );

  return (
    <AstryxAppShell
      className="workspace-shell"
      variant="elevated"
      height="fill"
      contentPadding={0}
      mobileNav={{ breakpoint: "md" }}
      topNav={topNav}
      sideNav={sideNav}
    >
      <div className="page"><Outlet /></div>
    </AstryxAppShell>
=======
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const nav = (
    <>
      <NavLink className="brand" to="/" onClick={() => setOpen(false)}>
        <img src="/authenik8-logo.svg" alt="" />
        <span>Authenik8 <small>Workspace</small></span>
      </NavLink>
      <nav className="side-nav" aria-label="Primary navigation">
        <p className="nav-label">Workspace</p>
        {mainLinks.map(({ icon: Icon, ...link }) => (
          <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setOpen(false)}>
            <Icon size={18} /> <span>{link.label}</span>
          </NavLink>
        ))}
        {user?.role === "ADMIN" && (
          <>
            <p className="nav-label">Administration</p>
            <NavLink to="/admin/users" onClick={() => setOpen(false)}><Users size={18} /> <span>Users</span></NavLink>
            <NavLink to="/admin/audit" onClick={() => setOpen(false)}><Activity size={18} /> <span>Audit trail</span></NavLink>
          </>
        )}
      </nav>
      <div className="sidebar-account">
        <div className="avatar">{user?.name.slice(0, 2).toUpperCase()}</div>
        <div><strong>{user?.name}</strong><span>{user?.email}</span></div>
      </div>
    </>
  );

  return (
    <div className="app-layout">
      <aside className="sidebar">{nav}</aside>
      {open && <div className="mobile-scrim" onClick={() => setOpen(false)} />}
      <aside className={`mobile-sidebar ${open ? "is-open" : ""}`} aria-hidden={!open}>{nav}</aside>
      <div className="app-main">
        <header className="topbar">
          <Button className="icon-button menu-button" variant="ghost" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} title={open ? "Close navigation" : "Open navigation"}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </Button>
          <div className="breadcrumb"><ShieldCheck size={17} /><span>{titleForPath(location.pathname)}</span></div>
          <Button className="icon-button" variant="ghost" onClick={() => void logout()} aria-label="Sign out" title="Sign out"><LogOut size={19} /></Button>
        </header>
        <main className="page"><Outlet /></main>
      </div>
    </div>
>>>>>>> main
  );
}

function titleForPath(pathname: string) {
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/settings")) return "Account settings";
  if (pathname.startsWith("/admin")) return "Administration";
  return "Dashboard";
}
