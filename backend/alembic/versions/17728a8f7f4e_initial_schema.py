"""Initial schema

Revision ID: 17728a8f7f4e
Revises: 
Create Date: 2026-11-12 01:06:16.056889

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17728a8f7f4e'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # 2. stories
    op.create_table(
        'stories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stories_id'), 'stories', ['id'], unique=False)
    op.create_index(op.f('ix_stories_user_id'), 'stories', ['user_id'], unique=False)

    # 3. chapters
    op.create_table(
        'chapters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('story_id', sa.Integer(), nullable=False),
        sa.Column('number', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chapters_id'), 'chapters', ['id'], unique=False)
    op.create_index(op.f('ix_chapters_story_id'), 'chapters', ['story_id'], unique=False)

    # 4. entities
    op.create_table(
        'entities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('story_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_entities_id'), 'entities', ['id'], unique=False)
    op.create_index(op.f('ix_entities_name'), 'entities', ['name'], unique=False)
    op.create_index(op.f('ix_entities_story_id'), 'entities', ['story_id'], unique=False)

    # 5. facts
    op.create_table(
        'facts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('story_id', sa.Integer(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('chapter_id', sa.Integer(), nullable=True),
        sa.Column('chapter_number', sa.Integer(), nullable=False),
        sa.Column('entity_name', sa.String(length=255), nullable=False),
        sa.Column('attribute', sa.String(length=100), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('day', sa.String(length=100), nullable=True),
        sa.Column('quote', sa.Text(), nullable=False),
        sa.Column('embedding', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['chapter_id'], ['chapters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['entity_id'], ['entities.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_facts_chapter_id'), 'facts', ['chapter_id'], unique=False)
    op.create_index(op.f('ix_facts_entity_id'), 'facts', ['entity_id'], unique=False)
    op.create_index(op.f('ix_facts_id'), 'facts', ['id'], unique=False)
    op.create_index(op.f('ix_facts_story_id'), 'facts', ['story_id'], unique=False)

    # 6. rules
    op.create_table(
        'rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('story_id', sa.Integer(), nullable=False),
        sa.Column('chapter_id', sa.Integer(), nullable=True),
        sa.Column('chapter_number', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quote', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['chapter_id'], ['chapters.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rules_chapter_id'), 'rules', ['chapter_id'], unique=False)
    op.create_index(op.f('ix_rules_id'), 'rules', ['id'], unique=False)
    op.create_index(op.f('ix_rules_story_id'), 'rules', ['story_id'], unique=False)

    # 7. flags
    op.create_table(
        'flags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('story_id', sa.Integer(), nullable=False),
        sa.Column('fact_id', sa.Integer(), nullable=True),
        sa.Column('conflicting_fact_id', sa.Integer(), nullable=True),
        sa.Column('type', sa.String(length=100), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=False),
        sa.Column('old_quote', sa.Text(), nullable=False),
        sa.Column('new_quote', sa.Text(), nullable=False),
        sa.Column('chapter_number', sa.Integer(), nullable=False),
        sa.Column('severity', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['conflicting_fact_id'], ['facts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['fact_id'], ['facts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_flags_conflicting_fact_id'), 'flags', ['conflicting_fact_id'], unique=False)
    op.create_index(op.f('ix_flags_fact_id'), 'flags', ['fact_id'], unique=False)
    op.create_index(op.f('ix_flags_id'), 'flags', ['id'], unique=False)
    op.create_index(op.f('ix_flags_story_id'), 'flags', ['story_id'], unique=False)


def downgrade() -> None:
    op.drop_table('flags')
    op.drop_table('rules')
    op.drop_table('facts')
    op.drop_table('entities')
    op.drop_table('chapters')
    op.drop_table('stories')
    op.drop_table('users')
