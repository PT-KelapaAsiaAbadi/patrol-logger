import { render } from "preact";
import "./index.css";
import { AppProvider } from "./state";
import { App } from "./app";
import { startAutoSync } from "./data/api";

startAutoSync();

render(
	<AppProvider>
		<App />
	</AppProvider>,
	document.getElementById("app")!,
);
