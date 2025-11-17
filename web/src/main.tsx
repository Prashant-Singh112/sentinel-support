import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import DashboardPage from "./routes/Dashboard";
import AlertsPage from "./routes/Alerts";
import CustomerPage from "./routes/Customer";
import EvalsPage from "./routes/Evals";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "customer/:id", element: <CustomerPage /> },
      { path: "evals", element: <EvalsPage /> }
    ]
  }
]);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
