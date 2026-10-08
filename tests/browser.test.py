import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import unittest
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


class BrowserTests(unittest.TestCase):
    def test_http(self):
        self.check_presentation(False)

    def test_https(self):
        self.check_presentation(True)

    def check_presentation(self, use_https):
        with tempfile.TemporaryDirectory(prefix="medidesk-browser-") as folder:
            environment = dict(os.environ)
            port, csrf_port = free_port(), free_port()
            password = secrets.token_hex(18)
            protocol = "https" if use_https else "http"
            origin = f"{protocol}://127.0.0.1:{port}"
            csrf_origin = f"{protocol}://127.0.0.1:{csrf_port}"
            environment.update(
                HOST="127.0.0.1",
                PORT=str(port),
                CSRF_PORT=str(csrf_port),
                LAB_MODE="1",
                MEDIDESK_DB_PATH=str(Path(folder) / "test.sqlite"),
                MEDIDESK_DEMO_PASSWORD=password,
                MEDIDESK_TARGET_ORIGIN=origin,
                MEDIDESK_TLS_CERT="",
                MEDIDESK_TLS_KEY="",
            )
            if use_https:
                openssl = shutil.which("openssl") or (
                    r"C:\Program Files\Git\usr\bin\openssl.exe"
                )
                key = str(Path(folder) / "key.pem")
                cert = str(Path(folder) / "cert.pem")
                subprocess.run(
                    [
                        openssl,
                        "req",
                        "-x509",
                        "-newkey",
                        "rsa:2048",
                        "-nodes",
                        "-days",
                        "1",
                        "-keyout",
                        key,
                        "-out",
                        cert,
                        "-subj",
                        "/CN=127.0.0.1",
                        "-addext",
                        "subjectAltName=IP:127.0.0.1",
                    ],
                    check=True,
                    capture_output=True,
                )
                environment.update(MEDIDESK_TLS_CERT=cert, MEDIDESK_TLS_KEY=key)
            processes = []

            def start(script):
                process = subprocess.Popen(
                    ["node", script],
                    cwd=ROOT,
                    env=environment,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                processes.append(process)
                self.assertIn(b"127.0.0.1", process.stdout.readline())
                return process

            def stop(process):
                process.terminate()
                process.wait(timeout=10)
                process.stdout.close()
                process.stderr.close()

            try:
                application = start("server.js")
                start("lab/csrf-server.js")
                with sync_playwright() as driver:
                    browser = driver.chromium.launch(
                        channel="chrome", headless=True
                    )
                    context = browser.new_context(ignore_https_errors=True)
                    external_requests = []

                    def restrict_requests(route):
                        if urlparse(route.request.url).hostname != "127.0.0.1":
                            external_requests.append(route.request.url)
                            route.abort()
                        else:
                            route.continue_()

                    context.route("**/*", restrict_requests)
                    csrf_responses = []
                    context.on(
                        "response",
                        lambda response: (
                            csrf_responses.append(response.status)
                            if response.request.method == "POST"
                            and response.url.endswith("/status")
                            else None
                        ),
                    )
                    page = context.new_page()

                    def login():
                        page.goto(f"{origin}/login.html")
                        page.locator("#email").fill(
                            "p.rozmanowski@jakotako.com"
                        )
                        page.locator("#password").fill(password)
                        page.get_by_role("button", name="Zaloguj się").click()
                        page.wait_for_url("**/dashboard.html")
                        expect(page.locator('[data-stat="all"]')).to_have_text(
                            "4"
                        )

                    def variant(name):
                        with page.expect_navigation():
                            page.get_by_role(
                                "button", name=f"LAB: {name}"
                            ).click()
                        expect(
                            page.locator(f'[data-lab-variant="{name}"]')
                        ).to_have_attribute("aria-pressed", "true")

                    def change_status(status):
                        page.locator("#status").select_option(status)
                        with page.expect_response(
                            lambda response: response.request.method == "PATCH"
                        ) as result:
                            page.get_by_role(
                                "button", name="Zapisz status"
                            ).click()
                        self.assertEqual(result.value.status, 200)
                        expect(page.locator("#form-message")).to_contain_text(
                            "Zapisano"
                        )

                    login()
                    cookie = context.cookies(origin)[0]
                    self.assertEqual(cookie["secure"], use_https)
                    self.assertTrue(cookie["httpOnly"])
                    self.assertEqual(cookie["sameSite"], "Strict")
                    xss_link = page.locator("#lab-xss-link").get_attribute(
                        "href"
                    )
                    page.goto(f"{origin}/{xss_link}")
                    expect(page.locator("#ticket-description")).to_contain_text(
                        "<img"
                    )
                    alerts = []

                    def accept_alert(dialog):
                        alerts.append(dialog.message)
                        dialog.accept()

                    page.on("dialog", accept_alert)
                    with page.expect_event("dialog"):
                        variant("BEFORE")
                    expect(
                        page.locator("#ticket-description img")
                    ).to_have_count(1)
                    expect(page.locator("#status-form button")).to_be_enabled()
                    self.assertEqual(
                        alerts,
                        ["LAB XSS: nieszkodliwy komunikat demonstracyjny."],
                    )
                    variant("AFTER")
                    expect(
                        page.locator("#ticket-description img")
                    ).to_have_count(0)
                    expect(page.locator("#ticket-description")).to_contain_text(
                        "<img"
                    )
                    self.assertEqual(len(alerts), 1)
                    page.remove_listener("dialog", accept_alert)

                    page.goto(f"{origin}/ticket-details.html?id=1")
                    expect(page.locator("#status-form button")).to_be_enabled()
                    change_status("progress")
                    csrf_page = context.new_page()
                    csrf_page.goto(csrf_origin)
                    for mode, token_mode, result_status in [
                        ("BEFORE", "missing", 200),
                        ("AFTER", "missing", 403),
                        ("AFTER", "invalid", 403),
                    ]:
                        variant(mode)
                        csrf_page.locator("#token-mode").select_option(
                            token_mode
                        )
                        with context.expect_page() as opened:
                            csrf_page.get_by_role(
                                "button", name="Wyślij próbę CSRF"
                            ).click()
                        popup = opened.value
                        popup.wait_for_load_state()
                        self.assertEqual(csrf_responses[-1], result_status)
                        result = popup.request.get(
                            popup.url.replace("/status", "")
                        )
                        self.assertEqual(result.status, 200)
                        self.assertEqual(
                            result.json()["status"],
                            "closed" if result_status == 200 else "progress",
                        )
                        expect(popup.locator("body")).to_contain_text(
                            "closed" if result_status == 200 else "CSRF"
                        )
                        popup.close()
                        page.reload()
                        expect(
                            page.locator("#status-form button")
                        ).to_be_enabled()
                        change_status("progress")
                    change_status("closed")
                    change_status("progress")

                    dashboard = context.new_page()
                    dashboard.goto(f"{origin}/dashboard.html")
                    tickets = context.new_page()
                    tickets.goto(f"{origin}/tickets.html")
                    for mode in ["BEFORE", "AFTER"]:
                        variant(mode)
                        page.goto(f"{origin}/new-ticket.html")
                        submit = page.locator('#ticket-form [type="submit"]')
                        expect(submit).to_be_enabled()
                        page.locator("#title").fill("<b>Fikcyjny tytuł</b>")
                        description = '<img src="x" onerror="alert(1)">'
                        page.locator("#description").fill(description)
                        page.locator("#reporter").select_option("2")
                        page.locator("#agent").select_option("3")
                        with page.expect_response(
                            lambda response: response.request.method == "POST"
                            and response.url.endswith("/api/tickets")
                        ) as saved:
                            submit.click()
                        self.assertEqual(saved.value.status, 201)
                        ticket = saved.value.json()
                        dialog = page.locator("#created-ticket-dialog")
                        expect(dialog).to_be_visible()
                        expect(dialog.locator("#ticket-title")).to_have_text(
                            ticket["title"]
                        )
                        expect(
                            dialog.locator("#ticket-description")
                        ).to_have_text(ticket["description"])
                        expect(
                            dialog.locator("#ticket-description img")
                        ).to_have_count(0)
                        expect(dialog.locator("#ticket-agent")).to_have_text(
                            ticket["agentName"]
                        )
                        expect(dialog.locator("#ticket-reporter")).to_have_text(
                            ticket["reporterName"]
                        )
                        expect(dialog.locator("#ticket-email")).to_have_text(
                            ticket["reporterEmail"]
                        )
                        fields = [
                            "ticket-number",
                            "ticket-title",
                            "ticket-description",
                            "ticket-status",
                            "ticket-priority",
                            "ticket-reporter",
                            "ticket-agent",
                            "ticket-email",
                            "ticket-date",
                        ]
                        displayed = {
                            field: dialog.locator(f"#{field}").text_content()
                            for field in fields
                        }
                        self.assertTrue(
                            dialog.evaluate(
                                "element => element.contains(document.activeElement)"
                            )
                        )
                        for _ in range(5):
                            page.keyboard.press("Tab")
                            self.assertTrue(
                                dialog.evaluate(
                                    "element => element.contains(document.activeElement)"
                                )
                            )
                        page.keyboard.press("Shift+Tab")
                        self.assertTrue(
                            dialog.evaluate(
                                "element => element.contains(document.activeElement)"
                            )
                        )
                        for width in [320, 768, 1440]:
                            page.set_viewport_size(
                                {"width": width, "height": 900}
                            )
                            self.assertTrue(
                                page.evaluate(
                                    "document.documentElement.scrollWidth <= innerWidth"
                                )
                            )
                        if mode == "BEFORE":
                            page.keyboard.press("Escape")
                        else:
                            dialog.get_by_role("button", name="Zamknij").click()
                        expect(dialog).not_to_be_visible()
                        expect(submit).to_be_focused()
                        page.goto(
                            f'{origin}/ticket-details.html?id={ticket["id"]}'
                        )
                        expect(page.locator("#ticket-title")).to_have_text(
                            ticket["title"]
                        )
                        expect(
                            page.locator("#ticket-description")
                        ).to_have_text(description)
                        for field, value in displayed.items():
                            expect(page.locator(f"#{field}")).to_have_text(
                                value
                            )
                        expect(
                            page.locator("#delete-ticket-button")
                        ).not_to_be_visible()
                        change_status("closed")
                        button = page.locator("#delete-ticket-button")
                        expect(button).to_be_visible()
                        expect(
                            dashboard.locator('[data-stat="all"]')
                        ).to_have_text("5")
                        expect(
                            tickets.locator(
                                f'a[href="ticket-details.html?id={ticket["id"]}"]'
                            )
                        ).to_have_count(1)
                        page.once("dialog", lambda prompt: prompt.dismiss())
                        button.click()
                        self.assertEqual(
                            context.request.get(
                                f'{origin}/api/tickets/{ticket["id"]}'
                            ).status,
                            200,
                        )
                        page.once("dialog", lambda prompt: prompt.accept())
                        with page.expect_response(
                            lambda response: response.request.method == "DELETE"
                        ) as deleted:
                            button.click()
                        self.assertEqual(deleted.value.status, 200)
                        page.wait_for_url("**/tickets.html")
                        expect(
                            dashboard.locator('[data-stat="all"]')
                        ).to_have_text("4")
                        expect(
                            tickets.locator(
                                f'a[href="ticket-details.html?id={ticket["id"]}"]'
                            )
                        ).to_have_count(0)
                        page.goto(f"{origin}/ticket-details.html?id=1")
                        expect(
                            page.locator("#status-form button")
                        ).to_be_enabled()

                    stop(application)
                    environment.pop("LAB_MODE")
                    application = start("server.js")
                    context.clear_cookies()
                    login()
                    expect(page.locator("#lab-controls")).not_to_be_visible()
                    page.goto(f"{origin}/{xss_link}&variant=BEFORE")
                    expect(page.locator("#ticket-description")).to_contain_text(
                        "<img"
                    )
                    expect(
                        page.locator("#ticket-description img")
                    ).to_have_count(0)
                    self.assertEqual(external_requests, [])
                    browser.close()
            finally:
                for process in processes:
                    if process.poll() is None:
                        stop(process)


if __name__ == "__main__":
    unittest.main(verbosity=2)
