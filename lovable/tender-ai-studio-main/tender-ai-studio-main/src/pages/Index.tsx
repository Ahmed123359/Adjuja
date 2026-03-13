import { useState } from "react";
import { Menu, X } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import MainContent from "@/components/dashboard/MainContent";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background relative">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          isMobile
            ? `fixed inset-y-0 left-0 z-50 transition-transform duration-300 ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : ""
        }`}
      >
        <DashboardSidebar onClose={isMobile ? () => setSidebarOpen(false) : undefined} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {isMobile && (
          <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg border border-border bg-card hover:bg-accent transition-colors"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">O</span>
              </div>
              <span className="font-semibold text-foreground text-base tracking-tight">
                Offr<span className="text-primary">IA</span>
              </span>
            </div>
          </div>
        )}
        <MainContent />
      </div>
    </div>
  );
};

export default Index;
