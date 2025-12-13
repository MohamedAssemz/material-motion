import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import OrderCreate from "./pages/OrderCreate";
import Products from "./pages/Products";
import Admin from "./pages/Admin";
import QueueManufacturing from "./pages/QueueManufacturing";
import QueuePackaging from "./pages/QueuePackaging";
import QueueBoxing from "./pages/QueueBoxing";
import ExtraProducts from "./pages/ExtraProducts";
import Machines from "./pages/Machines";
import Customers from "./pages/Customers";
import BatchLookup from "./pages/BatchLookup";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/orders" 
              element={
                <ProtectedRoute>
                  <Orders />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/orders/:id" 
              element={
                <ProtectedRoute>
                  <OrderDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/orders/create" 
              element={
                <ProtectedRoute>
                  <OrderCreate />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/products" 
              element={
                <ProtectedRoute>
                  <Products />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/users" 
              element={
                <ProtectedRoute requiredRole="admin">
                  <Admin />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/queues/manufacturing" 
              element={
                <ProtectedRoute>
                  <QueueManufacturing />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/queues/packaging" 
              element={
                <ProtectedRoute>
                  <QueuePackaging />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/queues/boxing" 
              element={
                <ProtectedRoute>
                  <QueueBoxing />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/extra-products" 
              element={
                <ProtectedRoute>
                  <ExtraProducts />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/machines" 
              element={
                <ProtectedRoute requiredRole="admin">
                  <Machines />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/customers" 
              element={
                <ProtectedRoute>
                  <Customers />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/batch/:code" 
              element={<BatchLookup />} 
            />
            <Route 
              path="/batch" 
              element={<BatchLookup />} 
            />
            <Route 
              path="/analytics" 
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              } 
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
