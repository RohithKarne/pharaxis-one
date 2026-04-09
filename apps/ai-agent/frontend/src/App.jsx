import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AdminPanel from './components/AdminPanel'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div style={{ padding: '40px' }}>Pharaxis AI-Agent — Admin Panel coming in Sprint 1</div>} />
        <Route path="/admin/ai-config" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  )
}
