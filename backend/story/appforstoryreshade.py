"""
app.py: test harness / reference UI for Story_Wave_model.py.

It only calls functions from Story_Wave_model.py, so it doubles as an example for the team
(the production UI/API, storage and save/load are the team's work).

Run (from this folder):
    set GEMINI_API_KEY=your_key          (PowerShell: $env:GEMINI_API_KEY="your_key")
    pip install -r requirements.txt
    python app.py
Then open the local link it prints (usually http://127.0.0.1:7860).
"""
from concurrent.futures import ThreadPoolExecutor

import gradio as gr

import Story_Wave_model as sb

try:
    sb.configure()
except RuntimeError as e:
    raise SystemExit(str(e))

SAMPLE_SCENE = '''The monsoon had come early that year, and the old house smelled of wet earth and chai.

"Funny," said Aarav's grandmother, stirring the pot. "Meera always said the first rain smelled like a fresh start." She smiled a little and kept stirring.

Aarav shrugged. "Yeah. Rain's rain, I guess." He picked at the edge of the table.

"You haven't touched your food in two days."

"I'm not hungry. It's fine. Honestly, it's fine." He laughed, a short dry laugh. "At least the exams got postponed, right? Silver lining."

His grandmother set down the spoon. "Aarav. Look at me."

He didn't. He was staring at the silver watch on his wrist. "She was supposed to be at the school function. She promised. She said she'd sit in the front row and embarrass me by clapping too loud." His voice cracked. "I keep saving her a seat, Nani. In my head. Every single time. And every single time it's empty."

"Beta..."

"I can't do this," he whispered. "I can't. I don't know how to be a person without her. I don't know how."'''

# ---------------------------------------------------------------- state (single user, in memory)
state = {"universes": {"Universe 1": {"bible": [], "chapter": 0}}, "current": "Universe 1"}
gen = {"results": [], "labels": [], "chapter": 0}
last_voice = {"emotion": "calm", "intensity": 5}


def cur():
    return state["universes"][state["current"]]


def table():
    return [[f.entity, f.attribute, f.value, f.chapter, f.day or ""] for f in cur()["bible"]]


def bar(n):
    n = max(0, min(10, int(n)))
    return "●" * n + "○" * (10 - n)


# ---------------------------------------------------------------- Story tab
def load_demo():
    u = cur()
    u["bible"], u["chapter"] = [], 0
    for i, ch in enumerate(sb.DEMO_CHAPTERS[:3], 1):
        u["bible"] = sb.commit_scene(u["bible"], ch, i)
        u["chapter"] = i
    return sb.DEMO_CHAPTERS[3], table(), f"Loaded chapters 1-3 ({len(u['bible'])} facts). Chapter 4 is in the editor: click Check."


def run_check(text):
    if not text.strip():
        return "Paste a chapter first.", table()
    u = cur()
    n = u["chapter"] + 1
    prev_count = len(u["bible"])
    with ThreadPoolExecutor(max_workers=2) as ex:  # check and extract run in parallel
        check_job = ex.submit(sb.check, u["bible"], text, n) if u["bible"] else None
        extract_job = ex.submit(sb.extract, text, n)
        flags = check_job.result() if check_job else []
        new_facts = extract_job.result()
    u["bible"] = u["bible"] + new_facts
    u["chapter"] = n
    if not flags:
        report = f"✅ Chapter {n}: no contradictions found."
    else:
        report = f"### ⚠ Chapter {n}: {len(flags)} contradiction(s)\n\n" + "\n\n".join(
            f"**{c.type}**: {c.explanation}\n\n> was: *{c.old_quote}*\n>\n> now: *{c.new_quote}*" for c in flags)
    if prev_count:
        context = f"*Checked against the {prev_count} facts already in the bible. Click **New story** to start clean.*\n\n"
    else:
        context = "*The bible was empty, so there was nothing to check against. Facts were extracted.*\n\n"
    return context + report, table()


def new_story():
    """Clear everything (all universes) so your own text is not mixed with the demo."""
    state["universes"] = {"Universe 1": {"bible": [], "chapter": 0}}
    state["current"] = "Universe 1"
    gen.update(results=[], labels=[], chapter=0)
    return gr.update(choices=["Universe 1"], value="Universe 1"), [], "🧹 New story started: the bible is empty.", ""


def fork_universe():
    u = cur()
    name = f"Universe {len(state['universes']) + 1}"
    state["universes"][name] = {"bible": sb.fork_bible(u["bible"]), "chapter": u["chapter"]}
    state["current"] = name
    return gr.update(choices=list(state["universes"]), value=name), table(), f"🌌 Forked into **{name}**. Changes here no longer affect the original."


def switch_universe(name):
    if name in state["universes"]:
        state["current"] = name
    return table()


# ---------------------------------------------------------------- Write next scene tab
def run_generate(direction, emotion, intensity, sabotage):
    u = cur()
    if not u["bible"]:
        return "Load the demo story first (Story tab) so there is a bible to write from.", gr.update()
    n = u["chapter"] + 1
    results = sb.write_branches_audited(u["bible"], direction, emotion, int(intensity), n, sabotage)
    labels = [f"{chr(65 + i)}: {r.branch.title}" for i, r in enumerate(results)]
    gen.update(results=results, labels=labels, chapter=n)
    parts = []
    for label, r in zip(labels, results):
        scene = "\n".join("> " + ln for ln in r.branch.scene.splitlines())
        if r.flags is None:
            cont = "❔ Continuity check failed, try again."
        elif not r.flags:
            cont = "✅ No contradictions with the story bible."
        else:
            cont = f"⚠️ **{len(r.flags)} contradiction(s):**\n" + "\n".join(f"- {c.explanation}" for c in r.flags)
        if r.emotion and r.emotion.lines:
            peak = max(line.intensity for line in r.emotion.lines)
            drifts = sum(line.voice_match == "drifts" for line in r.emotion.lines)
            emo = f"Peak emotion {peak}/10 · voice drifts: {drifts}\n\n*{r.emotion.arc_summary}*"
        else:
            emo = "No scored dialogue in this branch."
        parts.append(f"### Branch {label}\n\n{scene}\n\n**Continuity:** {cont}\n\n**Emotion:** {emo}")
    return "\n\n---\n\n".join(parts), gr.update(choices=labels, value=None)


def _picked(choice):
    return gen["results"][gen["labels"].index(choice)] if choice in gen["labels"] else None


def commit_branch(choice):
    r = _picked(choice)
    if not r:
        return "Pick a branch first.", table()
    u = cur()
    u["bible"] = sb.commit_scene(u["bible"], r.branch.scene, gen["chapter"])
    u["chapter"] = gen["chapter"]
    warn = f" It was committed with {len(r.flags)} contradiction(s) still in it." if r.flags else ""
    return f"✅ Committed to chapter {u['chapter']}. The bible now has {len(u['bible'])} facts.{warn}", table()


def speak_branch(choice):
    r = _picked(choice)
    if not r:
        return None, "Pick a branch first."
    if not (r.emotion and r.emotion.lines):
        return None, "That branch has no dialogue to speak."
    top = max(r.emotion.lines, key=lambda line: line.intensity)
    path = sb.speak(top.line, top.underlying_emotion, top.intensity)
    return path, f"🔊 Speaking {top.speaker}'s line with the **underlying** emotion: {top.underlying_emotion} ({top.intensity}/10)."


# ---------------------------------------------------------------- Dialogue tab
def run_dialogue(character, situation, emotion, intensity):
    u = cur()
    if not u["bible"]:
        return "Load the demo story first (Story tab)."
    opts = sb.write_dialogue(u["bible"], character, situation, emotion, int(intensity))
    return "\n\n---\n\n".join(
        f"**Option {i}** · {o.underlying_emotion} `{bar(o.intensity)}` {o.intensity}/10\n\n> {o.line}\n\n*{o.why_in_voice}*"
        for i, o in enumerate(opts, 1))


# ---------------------------------------------------------------- Voice & Emotion (text) tab
def run_emotion(text):
    u = cur()
    if not text.strip():
        return "Paste a scene with dialogue first."
    if not u["bible"]:
        return "Load the demo story first (Story tab) so the voices have something to match against."
    rep = sb.analyze_emotion(u["bible"], text, u["chapter"] + 1)
    out = []
    for line in rep.lines:
        icon = {"consistent": "✅", "drifts": "⚠️", "unclear": "❔"}[line.voice_match]
        out.append(f"**{line.speaker}**: *{line.line}*\n\n{line.surface_emotion} → *underneath:* {line.underlying_emotion}  "
                   f"`{bar(line.intensity)}` {line.intensity}/10\n\nSubtext: {line.subtext}\n\n"
                   f"{icon} Voice {line.voice_match}: {line.note}")
    return "\n\n---\n\n".join(out) + f"\n\n---\n\n**Emotional arc:** {rep.arc_summary}"


# ---------------------------------------------------------------- Human voice tab
def run_voice(path):
    if not path:
        return "Record or upload a short clip first (under a minute works best)."
    r = sb.analyze_voice(path)
    last_voice.update(emotion=r.primary_emotion, intensity=r.intensity)
    mismatch = f"⚠️ **Tone vs words mismatch:** {r.mismatch_note}\n\n" if r.words_vs_tone_mismatch else ""
    return (f"**Heard:** *{r.transcript}*\n\n**{r.primary_emotion}** (also {r.secondary_emotion})  "
            f"`{bar(r.intensity)}` {r.intensity}/10\n\nValence: {r.valence} · Energy: {r.energy}\n\n"
            f"Delivery: {r.delivery_cues}\n\n{mismatch}{r.summary}")


def speak_plain(text, emotion, intensity):
    return sb.speak(text, emotion, int(intensity)) if text.strip() else None


def speak_heard(text):
    return sb.speak(text, last_voice["emotion"], last_voice["intensity"]) if text.strip() else None


# ---------------------------------------------------------------- UI
def build():
    with gr.Blocks(title="Story Bible (test harness)") as app:
        gr.Markdown("# 📖 Story Bible\nTest harness for `Story_Wave_model.py`. "
                    "Start in the **Story** tab and click **Load demo story**.")

        with gr.Tab("Story"):
            with gr.Row():
                universe = gr.Dropdown(choices=list(state["universes"]), value=state["current"], label="Universe")
                fork_btn = gr.Button("Fork universe")
                new_btn = gr.Button("New story (clear bible)")
            with gr.Row():
                with gr.Column():
                    editor = gr.Textbox(label="Chapter text", lines=12, placeholder="Paste or write a chapter...")
                    with gr.Row():
                        check_btn = gr.Button("Check chapter", variant="primary")
                        demo_btn = gr.Button("Load demo story")
                with gr.Column():
                    report = gr.Markdown("Flags will appear here.")
                    bible_view = gr.Dataframe(headers=["Entity", "Attribute", "Value", "Chapter", "Day"],
                                              label="Live story bible", interactive=False)
            check_btn.click(run_check, editor, [report, bible_view])
            demo_btn.click(load_demo, None, [editor, bible_view, report])
            fork_btn.click(fork_universe, None, [universe, bible_view, report])
            new_btn.click(new_story, None, [universe, bible_view, report, editor])
            universe.change(switch_universe, universe, bible_view)

        with gr.Tab("Write next scene"):
            gr.Markdown("The AI writes 3 branching scenes from the bible, then audits its own writing.")
            direction = gr.Textbox(label="What should happen next?",
                                   value="Aarav finally meets the lantern spirit and asks about his mother.")
            with gr.Row():
                g_emo = gr.Textbox(label="Target emotion", value="grief hidden behind humor")
                g_int = gr.Slider(1, 10, value=7, step=1, label="Intensity")
            sabotage = gr.Checkbox(label="Demo mode: make one branch secretly break a story fact "
                                         "(shows the checker catching the AI's own mistake)", value=False)
            gen_btn = gr.Button("Write 3 branches", variant="primary")
            branches_out = gr.Markdown()
            choice = gr.Radio(choices=[], label="Pick a branch")
            with gr.Row():
                commit_btn = gr.Button("Commit this branch to the story")
                voice_btn = gr.Button("AI speaks its most emotional line")
            commit_msg = gr.Markdown()
            gen_audio = gr.Audio(label="AI voice")
            gen_btn.click(run_generate, [direction, g_emo, g_int, sabotage], [branches_out, choice])
            commit_btn.click(commit_branch, choice, [commit_msg, bible_view])
            voice_btn.click(speak_branch, choice, [gen_audio, commit_msg])

        with gr.Tab("Dialogue"):
            gr.Markdown("Three in-voice lines for one character.")
            who = gr.Textbox(label="Character", value="Aarav's grandmother")
            situation = gr.Textbox(label="Situation", value="Aarav comes home and avoids talking about his mother")
            with gr.Row():
                d_emo = gr.Textbox(label="Underlying emotion", value="worried love")
                d_int = gr.Slider(1, 10, value=6, step=1, label="Intensity")
            d_btn = gr.Button("Write dialogue", variant="primary")
            d_out = gr.Markdown()
            d_btn.click(run_dialogue, [who, situation, d_emo, d_int], d_out)

        with gr.Tab("Voice & Emotion"):
            gr.Markdown("Paste a scene with dialogue. Each line is scored for surface vs hidden emotion "
                        "and checked against how that character is established.")
            scene = gr.Textbox(label="Scene", lines=10, value=SAMPLE_SCENE)
            emo_btn = gr.Button("Analyse voice & emotion", variant="primary")
            emo_out = gr.Markdown()
            emo_btn.click(run_emotion, scene, emo_out)

        with gr.Tab("Human voice"):
            gr.Markdown("**1.** Record or upload a short clip (get the speaker's consent). **2.** Let the AI speak a line.")
            mic = gr.Audio(sources=["microphone", "upload"], type="filepath", label="Human voice")
            hear_btn = gr.Button("Analyse this voice", variant="primary")
            voice_out = gr.Markdown()
            hear_btn.click(run_voice, mic, voice_out)
            gr.Markdown("---")
            line = gr.Textbox(label="Line for the AI to speak", value="I'm fine. Honestly, it's fine.")
            with gr.Row():
                emo = gr.Textbox(label="Emotion", value="suppressed grief")
                inten = gr.Slider(1, 10, value=6, step=1, label="Intensity")
            say_btn = gr.Button("AI speaks it")
            match_btn = gr.Button("AI speaks it with the emotion heard above")
            ai_audio = gr.Audio(label="AI voice")
            say_btn.click(speak_plain, [line, emo, inten], ai_audio)
            match_btn.click(speak_heard, line, ai_audio)
    return app


if __name__ == "__main__":
    build().launch()
