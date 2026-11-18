import os
import json
import time
import urllib.request
import urllib.error

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

missing = []
if not GROQ_API_KEY:
    missing.append("GROQ_API_KEY")
if not GEMINI_API_KEY:
    missing.append("GEMINI_API_KEY")
if missing:
    print("Error: missing environment variable(s): " + ", ".join(missing))
    raise SystemExit(1)

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

CREATOR_MODEL = "qwen/qwen3.8-27b"
REVIEWER_MODEL = "gemini-3.5-flash"

MAX_ROUNDS = 5


def _groq_request(model_name, system_instruction, user_prompt):
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 500,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        GROQ_ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + GROQ_API_KEY,
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            "Groq API HTTP error {code}: {msg}".format(code=e.code, msg=err)
        ) from e
    except urllib.error.URLError as e:
        raise RuntimeError("Groq API connection error: {err}".format(err=e)) from e
    finally:
        time.sleep(5)

    try:
        return body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError("Unexpected Groq response: {body}".format(body=body)) from e


def call_groq(model_name, system_instruction, user_prompt):
    """Call the Groq OpenAI-compatible chat completions API and return the text."""
    for attempt in range(2):
        try:
            return _groq_request(model_name, system_instruction, user_prompt)
        except RuntimeError as e:
            if "429" in str(e) and attempt == 0:
                print("Groq rate limit hit; waiting 25s and retrying...")
                time.sleep(25)
                continue
            raise
    raise RuntimeError("Groq request failed after retries.")


def _gemini_request(model_name, system_instruction, user_prompt):
    url = GEMINI_ENDPOINT.format(model_name=model_name, api_key=GEMINI_API_KEY)
    payload = {
        "contents": [{"parts": [{"text": user_prompt}]}],
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            "Gemini API HTTP error {code}: {msg}".format(code=e.code, msg=err)
        ) from e
    except urllib.error.URLError as e:
        raise RuntimeError("Gemini API connection error: {err}".format(err=e)) from e
    finally:
        time.sleep(5)

    try:
        return body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError("Unexpected Gemini response: {body}".format(body=body)) from e


def call_gemini(model_name, system_instruction, user_prompt):
    """Call the Gemini generateContent REST API and return the generated text."""
    for attempt in range(6):
        try:
            return _gemini_request(model_name, system_instruction, user_prompt)
        except RuntimeError as e:
            msg = str(e)
            if ("503" in msg or "429" in msg) and attempt < 5:
                wait = 20
                print("Gemini temporarily unavailable; waiting {}s and retrying (attempt {}/6)...".format(wait, attempt + 2))
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("Gemini request failed after retries.")


def read_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return ""


def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    task = read_file("task.txt")
    if not task.strip():
        raise SystemExit("Error: task.txt is empty or missing.")

    creator_system = (
        "You are the Creator agent. You produce a complete, high-quality solution "
        "in markdown based on the task. When a critique is provided, improve the "
        "solution to address it. Return only the solution markdown, no extra commentary."
    )
    reviewer_system = (
        "You are the Reviewer agent. Review the solution for errors, logical holes, "
        "and inaccuracies. If the solution is flawless, start your response with the "
        "exact keyword APPROVED followed by a brief note. Otherwise write concrete "
        "critique points. Return only the critique markdown."
    )

    for round_num in range(1, MAX_ROUNDS + 1):
        print("[Round {}/{}] Creator updating solution.md...".format(round_num, MAX_ROUNDS))

        critique = read_file("critique.md")
        creator_prompt = "Task:\n{task}\n\n".format(task=task)
        if critique.strip():
            creator_prompt += "Previous critique:\n{critique}\n\n".format(critique=critique)
        creator_prompt += "Write or improve the complete solution. Return the full solution markdown."

        solution = call_groq(CREATOR_MODEL, creator_system, creator_prompt)
        write_file("solution.md", solution)

        print("[Round {}/{}] Reviewer checking solution.md...".format(round_num, MAX_ROUNDS))

        solution_now = read_file("solution.md")
        reviewer_prompt = (
            "Task:\n{task}\n\nSolution:\n{solution}\n\n"
            "Review for errors, logical holes, and inaccuracies. "
            "If flawless, start with APPROVED. Otherwise write critique."
        ).format(task=task, solution=solution_now)

        critique_out = call_gemini(REVIEWER_MODEL, reviewer_system, reviewer_prompt)
        write_file("critique.md", critique_out)

        if critique_out.lstrip().startswith("APPROVED"):
            print("[Round {}/{}] Approved. Terminating early.".format(round_num, MAX_ROUNDS))
            return

    print("Reached maximum rounds without approval.")


if __name__ == "__main__":
    main()
