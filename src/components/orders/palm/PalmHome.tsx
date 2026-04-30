import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { createCounterOrder } from "@/lib/orders/queries";
import { useToast } from "@/hooks/use-toast";
import { LayoutGrid, ShoppingBag, Truck } from "lucide-react";
import { useState } from "react";

export const PalmHome = () => {
  const navigate = useNavigate();
  const { currentRestaurantId } = useRestaurant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleCounterOrder = async () => {
    if (!currentRestaurantId) return;
    setLoading(true);
    try {
      const orderId = await createCounterOrder(currentRestaurantId);
      navigate(`/palm/order/${orderId}`);
    } catch (error) {
      toast({
        title: "Erro ao criar pedido",
        description: "Não foi possível iniciar o atendimento de balcão.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Button
        variant="outline"
        className="h-32 flex flex-col gap-3 text-lg font-semibold border-2"
        onClick={() => navigate("/palm/tables")}
        disabled={loading}
      >
        <LayoutGrid className="w-8 h-8 text-primary" />
        Mesas
      </Button>

      <Button
        variant="outline"
        className="h-32 flex flex-col gap-3 text-lg font-semibold border-2"
        onClick={handleCounterOrder}
        disabled={loading}
      >
        <ShoppingBag className="w-8 h-8 text-orange-500" />
        Balcão
      </Button>

      <Button
        variant="outline"
        className="h-32 flex flex-col gap-3 text-lg font-semibold border-2"
        onClick={() => {
          // For now, delivery could use counter flow and change mode or we implement a dedicated one
          handleCounterOrder(); 
        }}
        disabled={loading}
      >
        <Truck className="w-8 h-8 text-blue-500" />
        Delivery
      </Button>
    </div>
  );
};
