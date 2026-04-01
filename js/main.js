import { subscribe, setWeather } from "./state.js";
import { recomputeRecommendations } from "./recommendFlow.js";
import { mountWeatherPanel } from "./ui/weatherPanel.js";
import { mountInputsPanel } from "./ui/inputsPanel.js";
import { mountFeedbackPanel } from "./ui/feedbackPanel.js";
import { mountOutfitsPanel } from "./ui/outfitsPanel.js";
import { mountSidebar } from "./ui/sidebar.js";

const weatherRoot = document.getElementById("weather-root");
const inputsRoot = document.getElementById("inputs-root");
const outfitsRoot = document.getElementById("outfits-root");
const feedbackRoot = document.getElementById("feedback-root");
const sidebarRoot = document.getElementById("sidebar-root");

const weatherUi = mountWeatherPanel(weatherRoot);
const inputsUi = mountInputsPanel(inputsRoot);
const outfitsUi = mountOutfitsPanel(outfitsRoot);
const sidebarUi = mountSidebar(sidebarRoot);

mountFeedbackPanel(feedbackRoot, subscribe);

subscribe(() => {
  weatherUi.render();
  inputsUi.render();
  outfitsUi.render();
  sidebarUi.render();
});

setWeather(null);
recomputeRecommendations();
