import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderCreate from "./pages/OrderCreate";
import OrderDetail from "./pages/OrderDetail";
import Products from "./pages/Products";
import Catalog from "./pages/Catalog";
import Customers from "./pages/Customers";
import Machines from "./pages/Machines";
import Boxes from "./pages/Boxes";
import ExtraInventory from "./pages/ExtraInventory";
import Admin from "./pages/Admin";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Auth from "./pages/Auth";
import BatchLookup from "./pages/BatchLookup";
import BoxLookup from "./pages/BoxLookup";
import NotFound from "./pages/NotFound";
import QueueManufacturing from "./pages/QueueManufacturing";
import QueueFinishing from "./pages/QueueFinishing";
import QueuePackaging from "./pages/QueuePackaging";
import QueueBoxing from "./pages/QueueBoxing";
import OrderManufacturing from "./pages/OrderManufacturing";
import OrderFinishing from "./pages/OrderFinishing";
import OrderPackaging from "./pages/OrderPackaging";
import OrderBoxing from "./pages/OrderBoxing";

const queryClient = new QueryClient();

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
            <Route path="/orders" element={<ProtectedPage><Orders /></ProtectedPage>} />
            <Route path="/orders/:id" element={<ProtectedPage><OrderDetail /></ProtectedPage>} />
            <Route path="/orders/:id/manufacturing" element={<ProtectedPage><OrderManufacturing /></ProtectedPage>} />
            <Route path="/orders/:id/finishing" element={<ProtectedPage><OrderFinishing /></ProtectedPage>} />
            <Route path="/orders/:id/packaging" element={<ProtectedPage><OrderPackaging /></ProtectedPage>} />
            <Route path="/orders/:id/boxing" element={<ProtectedPage><OrderBoxing /></ProtectedPage>} />
            <Route path="/orders/create" element={<ProtectedRoute requiredRole="admin"><AppLayout><OrderCreate /></AppLayout></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedPage><Products /></ProtectedPage>} />
            <Route path="/catalog" element={<ProtectedPage><Catalog /></ProtectedPage>} />
            <Route path="/users" element={<ProtectedRoute requiredRole="admin"><AppLayout><Admin /></AppLayout></ProtectedRoute>} />
            <Route path="/queues/manufacturing" element={<ProtectedPage><QueueManufacturing /></ProtectedPage>} />
            <Route path="/queues/finishing" element={<ProtectedPage><QueueFinishing /></ProtectedPage>} />
            <Route path="/queues/packaging" element={<ProtectedPage><QueuePackaging /></ProtectedPage>} />
            <Route path="/queues/boxing" element={<ProtectedPage><QueueBoxing /></ProtectedPage>} />
            <Route path="/extra-inventory" element={<ProtectedPage><ExtraInventory /></ProtectedPage>} />
            <Route path="/boxes" element={<ProtectedPage><Boxes /></ProtectedPage>} />
            <Route path="/machines" element={<ProtectedRoute requiredRole="admin"><AppLayout><Machines /></AppLayout></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute requiredRole="admin"><AppLayout><Customers /></AppLayout></ProtectedRoute>} />
            <Route path="/batch/:code" element={<ProtectedRoute><BatchLookup /></ProtectedRoute>} />
            <Route path="/batch" element={<ProtectedRoute><BatchLookup /></ProtectedRoute>} />
            <Route path="/box/:code" element={<ProtectedRoute><BoxLookup /></ProtectedRoute>} />
            <Route path="/box" element={<ProtectedRoute><BoxLookup /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedPage><Analytics /></ProtectedPage>} />
            <Route path="/reports" element={<ProtectedPage><Reports /></ProtectedPage>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
