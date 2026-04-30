import { Routes, Route, useNavigate } from "react-router-dom";
import { PalmHome } from "@/components/orders/palm/PalmHome";
import { PalmTableMap } from "@/components/orders/palm/PalmTableMap";
import { PalmOrderFlow } from "@/components/orders/palm/PalmOrderFlow";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const Palm = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full">
      <header className="bg-white border-b px-4 py-3 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Routes>
            <Route path="/" element={<h1 className="text-lg font-bold">Atendimento</h1>} />
            <Route path="*" element={
              <>
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-lg font-bold">Atendimento</h1>
              </>
            } />
          </Routes>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route path="/" element={<PalmHome />} />
          <Route path="/tables" element={<PalmTableMap />} />
          <Route path="/order/:orderId" element={<PalmOrderFlow />} />
        </Routes>
      </main>
    </div>
  );
};

export default Palm;
