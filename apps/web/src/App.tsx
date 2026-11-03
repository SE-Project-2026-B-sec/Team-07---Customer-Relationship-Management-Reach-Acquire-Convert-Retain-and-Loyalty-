import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Placeholder } from './pages/Placeholder';
import { RequireAuth } from './components/RequireAuth';
import { DealsBoard } from './pages/deals/DealsBoard';
import { EnquiryForm } from './pages/EnquiryForm';
import { LeadsPage } from './pages/leads/LeadsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { TicketsPage } from './pages/tickets/TicketsPage';
import { CampaignsPage } from './pages/campaigns/CampaignsPage';
import { SegmentsPage } from './pages/segments/SegmentsPage';
import { Customer360Page } from './pages/customers/Customer360Page';
import { CustomersPage } from './pages/customers/CustomersPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/enquiry" element={<EnquiryForm />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="segments" element={<SegmentsPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<Customer360Page />} />
          <Route
            path="contacts"
            element={<Placeholder title="Contacts" owner="Disha" stories="CRM-11, 13" />}
          />
          <Route
            path="accounts"
            element={<Placeholder title="Accounts" owner="Disha" stories="CRM-11" />}
          />
          <Route path="deals" element={<DealsBoard />} />

          <Route path="tickets" element={<TicketsPage />} />
          <Route
            path="loyalty"
            element={
              <Placeholder title="Loyalty" owner="Disha / Balla" stories="CRM-24, 25, 26, 27" />
            }
          />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route
            path="admin"
            element={<Placeholder title="Admin" owner="Disha" stories="CRM-6" />}
          />
        </Route>
      </Route>
    </Routes>
  );
}
