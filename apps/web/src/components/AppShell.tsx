import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  Activity,
  BookOpen,
  CheckCheck,
  FilePlus2,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Search,
  Siren,
  Users,
  Workflow,
  X
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useLocale } from "../i18n";
import type { NotificationRecord, Role } from "../types";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Avatar, formatRelative } from "./ui";

interface NavItem {
  to: string;
  label: { vi: string; en: string };
  icon: typeof LayoutDashboard;
  badge?: string;
  roles?: Role[];
}

const workspaceItems: NavItem[] = [
  { to: "/overview", label: { vi: "Tổng quan", en: "Overview" }, icon: LayoutDashboard },
  { to: "/cases/new", label: { vi: "Tạo yêu cầu", en: "New request" }, icon: FilePlus2 },
  { to: "/cases", label: { vi: "Hồ sơ", en: "Cases" }, icon: Inbox },
  {
    to: "/incidents",
    label: { vi: "Sự cố", en: "Incidents" },
    icon: Siren,
    roles: ["agent", "manager", "org_admin", "platform_admin"]
  },
  { to: "/knowledge", label: { vi: "Kho tri thức", en: "Knowledge" }, icon: BookOpen }
];

const adminItems: NavItem[] = [
  { to: "/system", label: { vi: "Vận hành", en: "System" }, icon: Activity, roles: ["manager", "org_admin", "platform_admin"] },
  {
    to: "/services",
    label: { vi: "Dịch vụ", en: "Services" },
    icon: Workflow,
    roles: ["manager", "org_admin", "platform_admin"]
  },
  {
    to: "/users",
    label: { vi: "Người dùng", en: "People" },
    icon: Users,
    roles: ["manager", "org_admin", "platform_admin"]
  }
];

const mobileItems = [
  { to: "/overview", label: { vi: "Trang chủ", en: "Home" }, icon: LayoutDashboard, end: true },
  { to: "/cases/new", label: { vi: "Tạo mới", en: "New" }, icon: FilePlus2, end: true },
  { to: "/cases", label: { vi: "Hồ sơ", en: "Cases" }, icon: Inbox, end: true },
  { to: "/knowledge", label: { vi: "Tra cứu", en: "Search" }, icon: Search, end: true }
];

const routeMeta = [
  { prefix: "/system", title: { vi: "Vận hành hệ thống", en: "System operations" }, subtitle: { vi: "Hạ tầng và nhật ký thay đổi", en: "Infrastructure and audit log" } },
  { prefix: "/cases/new", title: { vi: "Tạo yêu cầu", en: "New request" }, subtitle: { vi: "Tiếp nhận có AI hỗ trợ", en: "AI-assisted intake" } },
  { prefix: "/cases/", title: { vi: "Chi tiết hồ sơ", en: "Case detail" }, subtitle: { vi: "Theo dõi xử lý và lịch sử hoạt động", en: "Progress, conversations and audit trail" } },
  { prefix: "/cases", title: { vi: "Hồ sơ dịch vụ", en: "Service cases" }, subtitle: { vi: "Hàng đợi công việc của tổ chức", en: "Your organization’s shared queue" } },
  { prefix: "/incidents", title: { vi: "Trung tâm sự cố", en: "Incident center" }, subtitle: { vi: "Theo dõi sự cố đã ghi nhận", en: "Recorded incidents" } },
  { prefix: "/knowledge", title: { vi: "Kho tri thức", en: "Knowledge base" }, subtitle: { vi: "Tìm kiếm có căn cứ và kiểm soát nguồn", en: "Grounded answers from approved sources" } },
  { prefix: "/services", title: { vi: "Quản trị dịch vụ", en: "Service management" }, subtitle: { vi: "Cấu hình danh mục và quy tắc định tuyến", en: "Catalog, routing and SLA rules" } },
  { prefix: "/users", title: { vi: "Nhân sự và phân quyền", en: "People and access" }, subtitle: { vi: "Quản lý quyền truy cập theo vai trò", en: "Role-based access management" } },
  { prefix: "/overview", title: { vi: "Tổng quan vận hành", en: "Operations overview" }, subtitle: { vi: "Tình trạng dịch vụ theo thời gian thực", en: "Live service health" } }
];

function canAccess(item: NavItem, role?: Role) {
  return !item.roles || (role ? item.roles.includes(role) : false);
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { text } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const notificationRef = useRef<HTMLDivElement>(null);
  const meta = routeMeta.find((item) => location.pathname.startsWith(item.prefix)) || routeMeta.at(-1)!;
  const allowedWorkspaceItems = workspaceItems.filter((item) => canAccess(item, user?.role));
  const allowedAdminItems = adminItems.filter((item) => canAccess(item, user?.role));
  const organizationName = user?.organizationName || text("Tổ chức của bạn", "Your organization");
  const organizationMark = organizationName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    setNotificationError("");
    try {
      const response = await api<{
        notifications: NotificationRecord[];
        unreadCount: number;
      }>("/notifications?limit=8");
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch (requestError) {
      setNotificationError(
        requestError instanceof Error
          ? requestError.message
          : text("Không thể tải thông báo.", "Unable to load notifications.")
      );
    } finally {
      setNotificationLoading(false);
    }
  }, [text]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, user?.id]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => setNotificationOpen(false), [location.pathname]);

  function submitGlobalSearch(event: FormEvent) {
    event.preventDefault();
    const query = globalSearch.trim();
    navigate(query ? `/cases?search=${encodeURIComponent(query)}` : "/cases");
  }

  async function openNotification(notification: NotificationRecord) {
    setNotificationError("");
    try {
      if (!notification.read) {
        await api(`/notifications/${notification._id}/read`, { method: "PATCH" });
        setNotifications((current) =>
          current.map((item) => item._id === notification._id ? { ...item, read: true } : item)
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      setNotificationOpen(false);
      if (notification.actionUrl) navigate(notification.actionUrl);
    } catch (requestError) {
      setNotificationError(
        requestError instanceof Error
          ? requestError.message
          : text("Không thể cập nhật thông báo.", "Unable to update the notification.")
      );
    }
  }

  async function markAllNotificationsRead() {
    setNotificationError("");
    try {
      await api("/notifications/read-all", { method: "POST" });
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (requestError) {
      setNotificationError(
        requestError instanceof Error
          ? requestError.message
          : text("Không thể cập nhật thông báo.", "Unable to update notifications.")
      );
    }
  }

  return (
    <div className={`app-frame service-workspace ${user?.role === "requester" ? "student-workspace" : "staff-workspace"}`}>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <Link to="/overview" className="brand-link" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark">
              <Network size={19} />
            </span>
            <span className="brand-copy">
              <strong>CaseFlow</strong>
              <small>Service Intelligence</small>
            </span>
          </Link>
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            title={text("Đóng menu", "Close menu")}
            aria-label={text("Đóng menu", "Close menu")}
          >
            <X size={19} />
          </button>
        </div>

        <nav className="main-nav" aria-label={text("Điều hướng chính", "Main navigation")}>
          <span className="nav-section-label">{text("Công việc", "Workspace")}</span>
          {allowedWorkspaceItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/overview" || item.to === "/cases"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{text(item.label.vi, item.label.en)}</span>
                {item.badge ? <small className="nav-badge">{item.badge}</small> : null}
              </NavLink>
            );
          })}

          {allowedAdminItems.length ? <span className="nav-section-label nav-admin-label">{text("Quản trị", "Administration")}</span> : null}
          {allowedAdminItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{text(item.label.vi, item.label.en)}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="organization-switcher organization-summary">
            <span className="organization-logo">{organizationMark}</span>
            <span>
              <strong>{organizationName}</strong>
              <small>{text("Không gian tổ chức", "Organization workspace")}</small>
            </span>
          </div>
          <button className="nav-item logout-button" onClick={logout}>
            <LogOut size={18} />
            <span>{text("Đăng xuất", "Sign out")}</span>
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label={text("Đóng menu", "Close menu")} />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setMobileOpen(true)} aria-label={text("Mở menu", "Open menu")}>
            <span className="brand-mark">
              <Network size={18} />
            </span>
            <span>
              <strong>CaseFlow</strong>
              <small>{organizationName}</small>
            </span>
          </button>

          <div className="topbar-title">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              title={text("Mở menu", "Open menu")}
              aria-label={text("Mở menu", "Open menu")}
            >
              <Menu size={20} />
            </button>
            <div>
              <strong>{text(meta.title.vi, meta.title.en)}</strong>
              <span>{text(meta.subtitle.vi, meta.subtitle.en)}</span>
            </div>
          </div>

          <form className="global-search" onSubmit={submitGlobalSearch} role="search">
            <Search size={18} />
            <input
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder={text("Tìm hồ sơ...", "Search cases...")}
              aria-label={text("Tìm hồ sơ", "Search cases")}
            />
          </form>

          <div className="topbar-actions">
            <LocaleSwitcher compact />
            <div className="notification-center" ref={notificationRef}>
              <button
                className="icon-button notification-button"
                type="button"
                title={text("Thông báo", "Notifications")}
                aria-label={text("Thông báo", "Notifications")}
                aria-expanded={notificationOpen}
                onClick={() => {
                  const nextOpen = !notificationOpen;
                  setNotificationOpen(nextOpen);
                  if (nextOpen) void loadNotifications();
                }}
              >
                <Bell size={19} />
                {unreadCount ? <span className="notification-count">{Math.min(unreadCount, 99)}</span> : null}
              </button>
              {notificationOpen ? (
                <section className="notification-popover" aria-label={text("Danh sách thông báo", "Notification list")}>
                  <header>
                    <div>
                      <strong>{text("Thông báo", "Notifications")}</strong>
                      <span>{text(`${unreadCount} chưa đọc`, `${unreadCount} unread`)}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => void markAllNotificationsRead()}
                      disabled={!unreadCount}
                      title={text("Đánh dấu tất cả đã đọc", "Mark all as read")}
                      aria-label={text("Đánh dấu tất cả đã đọc", "Mark all as read")}
                    >
                      <CheckCheck size={17} />
                    </button>
                  </header>
                  <div className="notification-list">
                    {notificationLoading && !notifications.length ? (
                      <div className="notification-empty"><span className="spinner" /> {text("Đang tải", "Loading")}</div>
                    ) : null}
                    {notificationError ? <div className="notification-empty">{notificationError}</div> : null}
                    {!notificationLoading && !notificationError && !notifications.length ? (
                      <div className="notification-empty">{text("Bạn chưa có thông báo.", "You have no notifications.")}</div>
                    ) : null}
                    {notifications.map((notification) => (
                      <button
                        type="button"
                        className={`notification-item ${notification.read ? "" : "unread"}`}
                        key={notification._id}
                        onClick={() => void openNotification(notification)}
                      >
                        <span className="notification-item-marker" />
                        <span>
                          <strong>{notification.title}</strong>
                          <small>{notification.message}</small>
                          <time>{formatRelative(notification.createdAt)}</time>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
            <Link to="/profile" className="user-summary" aria-label={text("Hồ sơ cá nhân", "My profile")}>
              <Avatar name={user?.name || ""} color={user?.avatarColor} size="small" />
              <span>
                <strong>{user?.name}</strong>
                <small>{user?.title || user?.role}</small>
              </span>
            </Link>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>

        <nav className="mobile-bottom-nav" aria-label={text("Điều hướng di động", "Mobile navigation")}>
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const isCaseDetail =
              location.pathname.startsWith("/cases/") && location.pathname !== "/cases/new";
            const isActive =
              item.to === "/cases"
                ? location.pathname === "/cases" || isCaseDetail
                : location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={isActive ? "active" : ""}
              >
                <Icon size={20} />
                <span>{text(item.label.vi, item.label.en)}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
