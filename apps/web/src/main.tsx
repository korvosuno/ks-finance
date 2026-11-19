import { TransactionsPage } from './pages/TransactionsPage'
import { BasicsPage } from './pages/BasicsPage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { App, Entry, ManagementLayout } from './app/App'
import { BookPage } from './pages/BookPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupPage } from './pages/SetupPage'
import './app/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path='/' element={<App />}>
          <Route index element={<Entry />} />
          <Route path='setup' element={<SetupPage />} />
          <Route path='manage' element={<ManagementLayout />}>
            <Route index element={<Navigate to='transactions' replace />} />
            <Route path='transactions' element={<TransactionsPage />} />
            <Route
              path='transactions/:ledgerId/:transactionId'
              element={<TransactionsPage />}
            />
            <Route
              path='workspaces'
              element={<Navigate to='../settings' replace />}
            />
            <Route path='basics' element={<BasicsPage />} />
            <Route
              path='basics/ledgers/:workspaceId/:ledgerId'
              element={<BookPage />}
            />
            <Route
              path='ledgers/:workspaceId?'
              element={<Navigate to='../basics' replace />}
            />
            <Route
              path='ledgers/:workspaceId/:ledgerId/:section?/:transactionId?'
              element={<BookPage legacy />}
            />
            <Route path='tags' element={<Navigate to='../basics' replace />} />
            <Route path='settings' element={<SettingsPage />} />
            <Route
              path='devices'
              element={<Navigate to='../settings' replace />}
            />
            <Route
              path='profile'
              element={<Navigate to='../settings' replace />}
            />
          </Route>
          <Route path='*' element={<Entry />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
