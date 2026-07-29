import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  document.documentElement.dataset.chattidyFixture = "chatgpt";
  document.body.innerHTML = `
    <nav aria-label="Chat history">
      <div id="row-controller-one">
        <a href="/c/controller-one">
          <span class="truncate">Controller one</span>
        </a>
        <button class="native-menu" data-key="controller-one" aria-haspopup="menu">More</button>
      </div>
      <div id="row-controller-two">
        <a href="/c/controller-two">
          <span class="truncate">Controller two</span>
        </a>
        <button class="native-menu" data-key="controller-two" aria-haspopup="menu">More</button>
      </div>
    </nav>
  `;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: vi.fn()
      }
    }
  });
});

describe("ChatGPT controller native fast queue", () => {
  it("opens the next native menu after confirmation closes without waiting for the previous row to disappear", async () => {
    const events: string[] = [];

    document.querySelectorAll<HTMLButtonElement>(".native-menu").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.key!;
        events.push(`menu:${key}`);
        if (key === "controller-two") {
          events.push(
            document.querySelector("#row-controller-one")
              ? "first-row-still-visible"
              : "first-row-already-removed"
          );
        }

        const menu = document.createElement("div");
        menu.setAttribute("role", "menu");
        menu.innerHTML = `
          <button role="menuitem" data-testid="delete-conversation">Delete</button>
        `;
        document.body.appendChild(menu);
        menu.querySelector("button")!.addEventListener("click", () => {
          menu.remove();
          const dialog = document.createElement("div");
          dialog.setAttribute("role", "dialog");
          dialog.innerHTML = `
            <button data-testid="confirm-delete">Delete</button>
          `;
          document.body.appendChild(dialog);
          dialog.querySelector("button")!.addEventListener("click", () => {
            events.push(`confirm:${key}`);
            dialog.remove();
            if (key === "controller-two") {
              window.setTimeout(() => {
                document.querySelector("#row-controller-one")?.remove();
                document.querySelector("#row-controller-two")?.remove();
              }, 80);
            }
          });
        });
      });
    });

    vi.resetModules();
    await import("../src/content/index");

    clickOne("[data-action='expand']");
    const checkboxes = document.querySelectorAll<HTMLButtonElement>(".chattidy-check");
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((checkbox) => checkbox.click());
    clickOne("[data-action='open-delete']");

    const acknowledge = document.querySelector<HTMLInputElement>(
      "[data-role='acknowledge']"
    );
    expect(acknowledge).toBeTruthy();
    acknowledge!.checked = true;
    acknowledge!.dispatchEvent(new Event("change", { bubbles: true }));
    clickOne("[data-action='confirm-delete']");

    await vi.waitFor(() => {
      expect(events).toContain("confirm:controller-two");
    });
    expect(events).toEqual([
      "menu:controller-one",
      "confirm:controller-one",
      "menu:controller-two",
      "first-row-still-visible",
      "confirm:controller-two"
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector("#chattidy-root")?.textContent)
        .toContain("已删除 2 条聊天");
    });
    expect(document.querySelector("#chattidy-root")?.textContent)
      .toContain("v0.3.1");
  });
});

function clickOne(selector: string): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button).toBeTruthy();
  button!.click();
}
