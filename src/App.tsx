import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import OrderCreate from "./pages/OrderCreate";
import Products from "./pages/Products";
import Admin from "./pages/Admin";
import QueueManufacturing from "./pages/QueueManufacturing";
import QueueFinishing from "./pages/QueueFinishing";
import QueuePackaging from "./pages/QueuePackaging";
import QueueBoxing from "./pages/QueueBoxing";
import ExtraInventory from "./pages/ExtraInventory";
import Boxes from "./pages/Boxes";
import Machines from "./pages/Machines";
import Customers from "./pages/Customers";
import BatchLookup from "./pages/BatchLookup";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

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
            <Route path="/orders/create" element={<ProtectedPage><OrderCreate /></ProtectedPage>} />
            <Route path="/products" element={<ProtectedPage><Products /></ProtectedPage>} />
            <Route path="/users" element={<ProtectedRoute requiredRole="admin"><AppLayout><Admin /></AppLayout></ProtectedRoute>} />
            <Route path="/queues/manufacturing" element={<ProtectedPage><QueueManufacturing /></ProtectedPage>} />
            <Route path="/queues/finishing" element={<ProtectedPage><QueueFinishing /></ProtectedPage>} />
            <Route path="/queues/packaging" element={<ProtectedPage><QueuePackaging /></ProtectedPage>} />
            <Route path="/queues/boxing" element={<ProtectedPage><QueueBoxing /></ProtectedPage>} />
            <Route path="/extra-inventory" element={<ProtectedPage><ExtraInventory /></ProtectedPage>} />
            <Route path="/boxes" element={<ProtectedPage><Boxes /></ProtectedPage>} />
            <Route path="/machines" element={<ProtectedRoute requiredRole="admin"><AppLayout><Machines /></AppLayout></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedPage><Customers /></ProtectedPage>} />
            <Route path="/batch/:code" element={<BatchLookup />} />
            <Route path="/batch" element={<BatchLookup />} />
            <Route path="/analytics" element={<ProtectedPage><Analytics /></ProtectedPage>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
