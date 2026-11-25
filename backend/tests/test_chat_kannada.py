"""Chatbot in Kannada: Kannada questions find schemes, and replies use Kannada labels.

Scheme content (names, benefits, rules) stays as written in the source.
"""

from fastapi.testclient import TestClient

from app import chat
from app.main import app

client = TestClient(app)


def ask(message, lang="kn", context=None):
    return client.post("/chat", json={"message": message, "lang": lang, "context_ids": context or []}).json()


def titles(body):
    return {sec["title"] for s in body["sources"] for sec in s["details"]}


def test_kannada_question_finds_maternity_schemes_with_kannada_labels():
    body = ask("ನಾನು ಗರ್ಭಿಣಿ, ಕರ್ನಾಟಕದಲ್ಲಿ ವಾಸಿಸುತ್ತೇನೆ. ಯಾವ ಯೋಜನೆಗಳು ಸಹಾಯ ಮಾಡಬಹುದು?")
    names = [s["name"].lower() for s in body["sources"]]
    assert names and all("matru" in n or "maternity" in n for n in names), names
    assert "ಪ್ರಯೋಜನಗಳು" in titles(body) and "Benefits" not in titles(body)
    assert body["answer"].startswith("ನಿಮಗೆ") and "ಇಂಗ್ಲಿಷ್" in body["answer"]  # says scheme details are in English
    assert "ಅಧಿಕೃತ ಸರ್ಕಾರಿ ಸೇವೆಯಲ್ಲ" in body["disclaimer"]


def test_kannada_tb_question_shows_verified_scheme():
    body = ask("ಕ್ಷಯರೋಗಿಗಳಿಗೆ ಯಾವ ನೆರವು ಇದೆ?")
    assert body["sources"][0]["id"] == "nikshay-poshan-yojana" and body["sources"][0]["verified"]
    assert "ಇನ್ನೂ ದೃಢಪಟ್ಟಿಲ್ಲ" in titles(body)  # "Not yet confirmed" notes, translated label


def test_kannada_follow_up_questions():
    first = ask("ಹೆರಿಗೆ ಸಹಾಯ")
    ids = [s["id"] for s in first["sources"]]
    assert ids
    docs = ask("ಯಾವ ದಾಖಲೆಗಳು ಬೇಕು?", context=ids)
    assert [s["id"] for s in docs["sources"]] == ids and titles(docs) == {"ಬೇಕಾದ ದಾಖಲೆಗಳು"}
    who = ask("ಯಾರು ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು?", context=ids)
    assert titles(who) == {"ಯಾರು ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು"} and "ಅರ್ಹತೆಯ ನಿರ್ಧಾರವಲ್ಲ" in who["answer"]
    second = ask("ಎರಡನೇ ಯೋಜನೆಗೆ ಅರ್ಜಿ ಹೇಗೆ ಸಲ್ಲಿಸುವುದು?", context=ids)
    if len(ids) > 1:
        assert [s["id"] for s in second["sources"]] == [ids[1]]


def test_kannada_greeting_and_no_match():
    assert ask("ನಮಸ್ಕಾರ")["answer"].startswith("ನಮಸ್ಕಾರ!")
    body = ask("ಅಬಕದಡ")
    assert body["sources"] == [] and "myscheme.gov.in" in body["answer"]


def test_kannada_question_with_english_reply():
    body = ask("ವೃದ್ಧಾಪ್ಯ ಪಿಂಚಣಿ", lang="en")
    assert any("pension" in s["name"].lower() for s in body["sources"])
    assert "Benefits" in titles(body) and body["answer"].startswith("Here are")


def test_lang_is_validated_and_defaults_to_english():
    assert client.post("/chat", json={"message": "x", "lang": "hi"}).status_code == 422
    assert client.post("/chat", json={"message": "tb"}).json()["answer"].startswith("Here are")


def test_kannada_words_never_change_english_messages():
    assert chat.with_english("maternity benefit") == "maternity benefit"
    assert "pregnant" in chat.with_english("ನಾನು ಗರ್ಭಿಣಿಯರಿಗೆ")  # suffixes still match
