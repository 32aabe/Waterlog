import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { TabBar } from "./components/TabBar";
import { ThemeProvider } from "./contexts/ThemeContext";
import MapHome from "./pages/MapHome";
import Journal from "./pages/Journal";
import Capture from "./pages/Capture";
import Spots from "./pages/Spots";
import Profile from "./pages/Profile";
import SpotStory from "./pages/SpotStory";

// Every screen sits behind the bottom TabBar — the entire primary nav for
// Waterlog (see §04/§06 of the Ver.3 design proposal). Login is enforced
// inside individual pages that need personal data (Journal, Capture,
// Profile), not at the router level, so the map stays browsable before
// signing in.
function Router() {
  return (
    <Switch>
      <Route path={"/"} component={MapHome} />
      <Route path={"/journal"} component={Journal} />
      <Route path={"/capture"} component={Capture} />
      <Route path={"/spots"} component={Spots} />
      <Route path={"/profile"} component={Profile} />
      <Route path={"/spot/:id"} component={SpotStory} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <TabBar />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
