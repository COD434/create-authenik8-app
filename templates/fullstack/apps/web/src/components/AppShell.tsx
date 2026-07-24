import {
  Activity,
  FolderKanban,
  LayoutDashboard,
  LogOut,
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
import { useAuth } from "../auth/AuthProvider";

const mainLinks = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/settings/profile", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { user, logout } = useAuth();
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
  );
}

function titleForPath(pathname: string) {
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/settings")) return "Account settings";
  if (pathname.startsWith("/admin")) return "Administration";
  return "Dashboard";
}
