import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Placeholder } from './pages/Placeholder';
import { RequireAuth } from './components/RequireAuth';
import { DealsBoard } from './pages/deals/DealsBoard';
import { EnquiryForm } from './pages/EnquiryForm';
import { LeadsPage } from './pages/leads/LeadsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/enquiry" element={<EnquiryForm />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route
            path="campaigns"
            element={
              <Placeholder title="Campaigns" owner="Dhriti / Balla" stories="CRM-17, 18, 19" />
            }
          />
          <Route path="leads" element={<LeadsPage />} />
          <Route
            path="contacts"
            element={<Placeholder title="Contacts" owner="Disha" stories="CRM-11, 13" />}
          />
          <Route
            path="accounts"
            element={<Placeholder title="Accounts" owner="Disha" stories="CRM-11" />}
          />
          <Route path="deals" element={<DealsBoard />} />

          <Route
            path="tickets"
            element={<Placeholder title="Tickets" owner="Diya" stories="CRM-21, 22, 23" />}
          />
          <Route
            path="loyalty"
            element={
              <Placeholder title="Loyalty" owner="Disha / Balla" stories="CRM-24, 25, 26, 27" />
            }
          />
          <Route
            path="reports"
            element={<Placeholder title="Reports" owner="Diya / Dhriti" stories="CRM-28, 29, 31" />}
          />
          <Route
            path="admin"
            element={<Placeholder title="Admin" owner="Disha" stories="CRM-6" />}
          />
        </Route>
      </Route>
    </Routes>
  );
}
