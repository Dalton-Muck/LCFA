import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { CourseSearchPage } from './pages/CourseSearchPage';
import { ScheduleGenerationPage } from './pages/ScheduleGenerationPage';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Sidebar />
        <div className="app-content">
          <Routes>
            <Route path="/" element={<CourseSearchPage />} />
            <Route path="/schedules" element={<ScheduleGenerationPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;

