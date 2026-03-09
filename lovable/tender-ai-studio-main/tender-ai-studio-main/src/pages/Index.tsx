import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import MainContent from "@/components/dashboard/MainContent";

const Index = () => {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <DashboardSidebar />
      <MainContent />
    </div>
  );
};

export default Index;
