import { RedwallApp } from "./app/RedwallApp";
import "./styles.css";

const mount = document.querySelector<HTMLDivElement>("#app");

if (!mount) {
  throw new Error("App mount point not found");
}

const app = new RedwallApp(mount, window.location.search);
app.start();
