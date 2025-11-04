import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';

export function Sidebar() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <div className="sidebar-header">
          <h2>LCFA</h2>
        </div>
        <ul className="nav-links">
          <li>
            <Link
              to="/"
              className={`nav-link ${isActive('/') ? 'active' : ''}`}
            >
              <span className="nav-icon">📚</span>
              <span>Course Search</span>
            </Link>
          </li>
          <li>
            <Link
              to="/schedules"
              className={`nav-link ${isActive('/schedules') ? 'active' : ''}`}
            >
              <span className="nav-icon">📅</span>
              <span>Generate Schedules</span>
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

