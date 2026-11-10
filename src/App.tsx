import { TriangleAlert } from "lucide-react";
import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";

const HomePage = lazy(() => import("@/pages/HomePage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const ChemicalPage = lazy(() => import("@/pages/ChemicalPage"));
const AddChemicalPage = lazy(() => import("@/pages/AddChemicalPage"));
const CategoriesPage = lazy(() => import("@/pages/CategoriesPage"));
const CategoryDetailPage = lazy(() => import("@/pages/CategoryDetailPage"));
const LocationsPage = lazy(() => import("@/pages/LocationsPage"));
const LocationDetailPage = lazy(() => import("@/pages/LocationDetailPage"));
const AlertsPage = lazy(() => import("@/pages/AlertsPage"));
const InsightsPage = lazy(() => import("@/pages/InsightsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ImportPage = lazy(() => import("@/pages/ImportPage"));
const ReviewPage = lazy(() => import("@/pages/ReviewPage"));
const MorePage = lazy(() => import("@/pages/MorePage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-14 w-full rounded-[20px]" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-36 rounded-[20px]" />
        <Skeleton className="h-36 rounded-[20px]" />
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong on this screen"
        description="Your inventory data is safe. Reload the page or go back and try again."
        action={<Button onClick={() => window.location.reload()}>Reload</Button>}
      />
    );
  }
}

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  const { pathname } = useLocation();
  return (
    <AppShell>
      <ScrollReset />
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/chemicals/new" element={<AddChemicalPage />} />
          <Route path="/chemicals/:id" element={<ChemicalPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/categories/:slug" element={<CategoryDetailPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/locations/:id" element={<LocationDetailPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
