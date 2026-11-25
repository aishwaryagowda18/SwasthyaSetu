import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Questionnaire from "./pages/Questionnaire";
import Results from "./pages/Results";
import SchemeDetail from "./pages/SchemeDetail";
import NotFound from "./pages/NotFound";
import Checklist from "./pages/Checklist";
import Catalogue from "./pages/Catalogue";
import CatalogueEntry from "./pages/CatalogueEntry";
import { AdminSessionProvider } from "./admin/session";
import { AnswersProvider, type Answers } from "./answers";
import { LanguageProvider, type Lang } from "./i18n";
import AdminLayout from "./admin/AdminLayout";
import AdminLogin from "./admin/AdminLogin";
import AdminDashboard from "./admin/AdminDashboard";
import AdminScheme from "./admin/AdminScheme";
import { AdminAudit, AdminSources } from "./admin/AdminSources";

export default function App({ initialAnswers, initialLang }: { initialAnswers?: Partial<Answers>; initialLang?: Lang } = {}) {
  return (
    <LanguageProvider initial={initialLang}>
    <AnswersProvider initial={initialAnswers}>
    <AdminSessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
          <Route path="/results" element={<Results />} />
          <Route path="/schemes/:schemeId" element={<SchemeDetail />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/catalogue/:entryId" element={<CatalogueEntry />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="schemes/:schemeId" element={<AdminScheme />} />
            <Route path="sources" element={<AdminSources />} />
            <Route path="audit" element={<AdminAudit />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AdminSessionProvider>
    </AnswersProvider>
    </LanguageProvider>
  );
}
