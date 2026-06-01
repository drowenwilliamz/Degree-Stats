const fs = require("fs");
const vm = require("vm");

const data = fs.readFileSync("web/degree_results_data.js", "utf8");
const app = fs.readFileSync("web/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

if (!html.includes('href="web/styles.css"') || !html.includes('src="web/degree_results_data.js"') || !html.includes('src="web/app.js"')) {
  throw new Error("Root index.html does not reference the expected web assets.");
}

class ElementStub {
  constructor(id) {
    this.id = id;
    this.value = "";
    this.dataset = { view: "overview" };
    this.classList = { add() {}, remove() {} };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    const option = String(value).match(/<option(?: value="([^"]*)")?[^>]*>([^<]*)/);
    if (option && !this.value) this.value = option[1] || option[2];
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  set textContent(value) {
    this._textContent = value;
  }

  get textContent() {
    return this._textContent || "";
  }

  addEventListener() {}
  click() {}
}

const elements = {};
const document = {
  querySelector(selector) {
    if (!elements[selector]) elements[selector] = new ElementStub(selector);
    return elements[selector];
  },
  querySelectorAll(selector) {
    if (selector === ".tab") return [new ElementStub("t1"), new ElementStub("t2"), new ElementStub("t3")];
    if (selector === ".tab, .view") return [new ElementStub("view")];
    return [];
  },
  createElement() {
    return new ElementStub("created");
  },
};

const context = vm.createContext({
  Blob: function Blob() {},
  console,
  document,
  window: {
    document,
    URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
  },
});

vm.runInContext(`${data}\n${app}`, context);

const checks = {
  shifts: document.querySelector("#shiftChart").innerHTML.length,
  normal: document.querySelector("#normalRefChart").innerHTML.length,
  density: document.querySelector("#densityChart").innerHTML.length,
  qq: document.querySelector("#qqChart").innerHTML.length,
  notes: document.querySelector("#reportBullets").innerHTML.length,
  detail: document.querySelector("#moduleDetail").innerHTML.length,
  rows: document.querySelector("#moduleTable").innerHTML.length,
};

if (!checks.shifts || !checks.detail || !checks.rows) {
  throw new Error(`Dashboard render smoke check failed: ${JSON.stringify(checks)}`);
}

console.log(`Dashboard render smoke ok: ${JSON.stringify(checks)}`);
