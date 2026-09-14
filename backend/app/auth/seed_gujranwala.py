"""Seed only two Gujranwala campuses with realistic demo users + module data.

Run:
  cd backend
  python -m app.auth.seed_gujranwala
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.auth.models import Batch, Branch, User
from app.auth.security import hash_password
from app.config import settings
from app.database import SessionLocal, init_db
from app.homework.models import HomeworkAssignment, HomeworkSubmission
from app.mocks.models import MockAssignment, MockAssignmentStudent, MockLibraryItem
from app.mocks.seed import ensure_library
from app.notes.models import ClassNote
from app.notes.seed import ensure_sample_note

logger = logging.getLogger(__name__)

PASSWORD = "password123"
ADMIN_PASSWORD = "Admin@12345"

BRANCHES = [
    {
        "id": "head-office-gujranwala",
        "name": "Head Office Gujranwala",
        "city": "Gujranwala",
        "admin": {"username": "ho.admin", "name": "Ayesha Malik", "email": "ho.admin@fti.local"},
        "teachers": [
            {"username": "ho.nadia", "name": "Nadia Rahman", "email": "nadia.ho@fti.local"},
            {"username": "ho.kamran", "name": "Kamran Ali", "email": "kamran.ho@fti.local"},
        ],
        "batches": [
            {"id": "ho-morning-a", "name": "Morning Batch A", "schedule": "Mon · Wed · Fri", "subjects": "Writing · Speaking"},
            {"id": "ho-evening-a", "name": "Evening Batch A", "schedule": "Tue · Thu", "subjects": "Reading · Listening"},
        ],
        "students": [
            ("ho.ali", "Ali Ahmad", "ali.ho@fti.local", "Morning Batch A"),
            ("ho.sara", "Sara Khan", "sara.ho@fti.local", "Morning Batch A"),
            ("ho.omar", "Omar Farouk", "omar.ho@fti.local", "Evening Batch A"),
            ("ho.maya", "Maya Chen", "maya.ho@fti.local", "Evening Batch A"),
        ],
    },
    {
        "id": "mall-of-gujranwala",
        "name": "Mall of Gujranwala",
        "city": "Gujranwala",
        "admin": {"username": "mall.admin", "name": "Hassan Raza", "email": "mall.admin@fti.local"},
        "teachers": [
            {"username": "mall.hina", "name": "Hina Saeed", "email": "hina.mall@fti.local"},
            {"username": "mall.usman", "name": "Usman Javed", "email": "usman.mall@fti.local"},
        ],
        "batches": [
            {"id": "mall-weekend", "name": "Weekend Batch", "schedule": "Sat · Sun", "subjects": "Writing · Reading · Listening · Speaking"},
            {"id": "mall-afternoon", "name": "Afternoon Batch", "schedule": "Mon · Wed", "subjects": "Speaking · Listening"},
        ],
        "students": [
            ("mall.noor", "Noor Fatima", "noor.mall@fti.local", "Weekend Batch"),
            ("mall.tariq", "Tariq Mehmood", "tariq.mall@fti.local", "Weekend Batch"),
            ("mall.hira", "Hira Nawaz", "hira.mall@fti.local", "Afternoon Batch"),
            ("mall.danish", "Danish Iqbal", "danish.mall@fti.local", "Afternoon Batch"),
        ],
    },
]


def _uid() -> str:
    return str(uuid.uuid4())


def _upsert_user(db: Session, *, role: str, username: str, email: str, full_name: str, password: str, branch_id: str = "", batch: str = "", batches: str = "") -> User:
    row = db.query(User).filter((User.username == username) | (User.email == email)).first()
    if not row:
        row = User(id=_uid())
        db.add(row)
    row.role = role
    row.username = username.lower()
    row.email = email.lower()
    row.full_name = full_name
    row.password_hash = hash_password(password)
    row.branch_id = branch_id
    row.batch = batch
    row.batches = batches
    row.is_active = True
    return row


def seed_gujranwala(db: Session) -> dict:
    # Keep only these two campuses in auth tables (deactivate other branch users/branches).
    keep_ids = {b["id"] for b in BRANCHES}
    for branch in db.query(Branch).all():
        if branch.id not in keep_ids:
            db.delete(branch)
    for batch in db.query(Batch).all():
        if batch.branch_id not in keep_ids:
            db.delete(batch)

    # Super admin
    admin = _upsert_user(
        db,
        role="super_admin",
        username="admin",
        email="admin@local",
        full_name="Super Admin",
        password=ADMIN_PASSWORD,
    )

    created_users: list[User] = [admin]
    teacher_by_branch: dict[str, list[User]] = {}
    students_by_batch: dict[str, list[User]] = {}

    for spec in BRANCHES:
        branch = db.query(Branch).filter_by(id=spec["id"]).first()
        if not branch:
            branch = Branch(id=spec["id"])
            db.add(branch)
        branch.name = spec["name"]
        branch.city = spec["city"]

        ba = _upsert_user(
            db,
            role="branch_admin",
            username=spec["admin"]["username"],
            email=spec["admin"]["email"],
            full_name=spec["admin"]["name"],
            password=PASSWORD,
            branch_id=spec["id"],
        )
        created_users.append(ba)

        teachers: list[User] = []
        for i, t in enumerate(spec["teachers"]):
            batch_names = ", ".join(b["name"] for b in spec["batches"] if i == 0 or True)
            # First teacher gets first batch, second gets second
            assigned = spec["batches"][min(i, len(spec["batches"]) - 1)]["name"]
            row = _upsert_user(
                db,
                role="teacher",
                username=t["username"],
                email=t["email"],
                full_name=t["name"],
                password=PASSWORD,
                branch_id=spec["id"],
                batches=assigned,
            )
            teachers.append(row)
            created_users.append(row)
        teacher_by_branch[spec["id"]] = teachers

        for i, b in enumerate(spec["batches"]):
            teacher = teachers[min(i, len(teachers) - 1)]
            batch = db.query(Batch).filter_by(id=b["id"]).first()
            if not batch:
                batch = Batch(id=b["id"])
                db.add(batch)
            batch.name = b["name"]
            batch.schedule = b["schedule"]
            batch.subjects = b["subjects"]
            batch.branch_id = spec["id"]
            batch.teacher_id = teacher.id

        for username, name, email, batch_name in spec["students"]:
            row = _upsert_user(
                db,
                role="student",
                username=username,
                email=email,
                full_name=name,
                password=PASSWORD,
                branch_id=spec["id"],
                batch=batch_name,
            )
            created_users.append(row)
            students_by_batch.setdefault(batch_name, []).append(row)

    # Deactivate users not in this seed (except super admin)
    keep_usernames = {u.username for u in created_users}
    for user in db.query(User).all():
        if user.username not in keep_usernames:
            user.is_active = False

    db.commit()

    ensure_library(db)
    ensure_sample_note(db)

    # Clear old homework/mocks seed rows we own, then recreate for these batches
    for hw in db.query(HomeworkAssignment).filter(HomeworkAssignment.created_by.in_(["seed-gujranwala", "system"])).all():
        db.query(HomeworkSubmission).filter_by(assignment_id=hw.id).delete()
        db.delete(hw)
    for ma in db.query(MockAssignment).filter(MockAssignment.created_by == "seed-gujranwala").all():
        db.query(MockAssignmentStudent).filter_by(assignment_id=ma.id).delete()
        db.delete(ma)

    # Notes unlocked for both morning/weekend style batches
    notes = db.query(ClassNote).all()
    unlock_batches = ["Morning Batch A", "Evening Batch A", "Weekend Batch", "Afternoon Batch"]
    for note in notes:
        note.unlocked_batches = unlock_batches
        note.created_by = teacher_by_branch["head-office-gujranwala"][0].id

    # Extra note
    dest = Path(settings.NOTES_DIR)
    dest.mkdir(parents=True, exist_ok=True)
    extra_name = "gujranwala-writing-tips.txt"
    (dest / extra_name).write_text(
        "FTI Gujranwala — Writing tips\n\n1. Plan 2 minutes before Task 2.\n2. Use clear topic sentences.\n3. Check grammar in the last 3 minutes.\n",
        encoding="utf-8",
    )
    if not db.query(ClassNote).filter_by(stored_name=extra_name).first():
        note = ClassNote(
            title="Writing tips — Gujranwala",
            description="Shared notes for both Gujranwala campuses.",
            original_name=extra_name,
            stored_name=extra_name,
            page_count=1,
            created_by=teacher_by_branch["mall-of-gujranwala"][0].id,
        )
        note.unlocked_batches = unlock_batches
        db.add(note)

    modules = [
        ("writing", "Writing Task 2 — Education", "Morning Batch A"),
        ("reading", "Reading practice — Matching headings", "Evening Batch A"),
        ("listening", "Listening Section 1 drill", "Weekend Batch"),
        ("speaking", "Speaking Part 2 cue card", "Afternoon Batch"),
    ]
    for module, title, batch_label in modules:
        students = students_by_batch.get(batch_label, [])
        teacher = next((t for tlist in teacher_by_branch.values() for t in tlist if batch_label in (t.batches or "")), None)
        if not teacher:
            teacher = teacher_by_branch["head-office-gujranwala"][0]
        hw = HomeworkAssignment(
            title=title,
            module=module,
            scope="piece",
            source="manual",
            task_label=module.title(),
            batch_label=batch_label,
            deadline=datetime.utcnow() + timedelta(days=7),
            timed="1",
            ai_grading_enabled="0",
            created_by=teacher.id,
        )
        hw.student_ids = [s.id for s in students]
        hw.payload = {
            "prompt": f"Practice {module} for {batch_label}. Write / answer carefully.",
            "instructions": "Complete before the deadline. Random demo homework for Gujranwala campuses.",
        }
        db.add(hw)
        db.flush()
        # One completed + one pending submission if students exist
        if students:
            sub = HomeworkSubmission(
                assignment_id=hw.id,
                student_id=students[0].id,
                status="submitted",
                estimated_band=6.5,
                started_at=datetime.utcnow() - timedelta(days=1),
                submitted_at=datetime.utcnow() - timedelta(hours=5),
            )
            db.add(sub)
            if len(students) > 1:
                db.add(
                    HomeworkSubmission(
                        assignment_id=hw.id,
                        student_id=students[1].id,
                        status="in_progress",
                        started_at=datetime.utcnow() - timedelta(hours=2),
                    )
                )

    lib = db.query(MockLibraryItem).filter_by(mock_type="reading").first() or db.query(MockLibraryItem).first()
    for spec in BRANCHES:
        batch = spec["batches"][0]
        teacher = teacher_by_branch[spec["id"]][0]
        students = students_by_batch.get(batch["name"], [])
        ma = MockAssignment(
            library_item_id=lib.id if lib else None,
            title=f"{spec['name']} — Reading Mock",
            mock_type=lib.mock_type if lib else "reading",
            ielts_type=lib.ielts_type if lib else "academic",
            assign_mode="batch",
            batch_id=batch["id"],
            batch_label=batch["name"],
            available_at=datetime.utcnow() - timedelta(hours=1),
            deadline_at=datetime.utcnow() + timedelta(days=5),
            duration_minutes=60,
            attempts_allowed=1,
            secure_mode=True,
            screen_monitoring=True,
            fullscreen_required=True,
            allow_late_start=True,
            auto_submit=True,
            paper_source="bank",
            result_mode="teacher",
            instructions="Supervised mock for Gujranwala campus. Screen share required.",
            created_by=teacher.id,
        )
        if lib:
            ma.paper_refs = lib.paper_refs
        db.add(ma)
        db.flush()
        for s in students:
            db.add(
                MockAssignmentStudent(
                    assignment_id=ma.id,
                    student_id=s.id,
                    student_name=s.full_name,
                    duration_minutes=60,
                    status="assigned",
                    available_at=ma.available_at,
                    deadline_at=ma.deadline_at,
                )
            )

    db.commit()
    return {
        "branches": [b["name"] for b in BRANCHES],
        "password": PASSWORD,
        "admin": {"username": "admin", "password": ADMIN_PASSWORD},
        "users": len(created_users),
    }


def main():
    logging.basicConfig(level=logging.INFO)
    init_db()
    db = SessionLocal()
    try:
        result = seed_gujranwala(db)
        print(json.dumps(result, indent=2))
        print("\nLogins (password for staff/students: password123)")
        print("  Super Admin: admin / Admin@12345")
        print("  HO Admin:    ho.admin / password123")
        print("  Mall Admin:  mall.admin / password123")
        print("  Teacher HO:  ho.nadia / password123")
        print("  Teacher Mall: mall.hina / password123")
        print("  Student HO:  ho.ali / password123")
        print("  Student Mall: mall.noor / password123")
    finally:
        db.close()


if __name__ == "__main__":
    main()
