import { Navigate, Route, Routes } from 'react-router-dom'
import { useSite } from './lib/context'
import { Alert, PageLoader } from './components/ui'
import Home from './pages/Home'
import { Login, Register, StaffLogin } from './pages/Auth'
import Cabinet from './pages/Cabinet'
import StaffApp from './pages/staff/StaffApp'

export default function App() {
  const { site, error } = useSite()
  if (!site) {
    return error ? (
      <div className="mx-auto max-w-md p-6">
        <Alert>Не удалось связаться с сервером: {error}</Alert>
      </div>
    ) : (
      <PageLoader />
    )
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/cabinet" element={<Cabinet />} />
      <Route path="/staff/login" element={<StaffLogin />} />
      <Route path="/staff/*" element={<StaffApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
