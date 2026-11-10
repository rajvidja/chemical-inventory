import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Page not found"
      description="The page you were looking for doesn't exist."
      action={
        <Button asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
