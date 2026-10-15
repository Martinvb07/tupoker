import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, trim: true, maxlength: 30 },
    avatarUrl: { type: String, default: '' },
    avatarColor: { type: String, default: '#f59e0b' },
    bio: { type: String, default: '', maxlength: 160 },
    prefs: {
      felt: { type: String, default: 'emerald' },
      fourColor: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName || this.username,
    avatarUrl: this.avatarUrl,
    avatarColor: this.avatarColor,
    bio: this.bio,
    prefs: this.prefs,
    createdAt: this.createdAt,
  };
};

const settingsSchema = {
  minBet: { type: Number, default: 100 },
  maxBet: { type: Number, default: 0 }, // 0 = sin límite
  startingChips: { type: Number, default: 10000 },
  mode: { type: String, enum: ['live', 'random', 'offline'], default: 'live' },
  chips: { type: [Number], default: [] }, // denominaciones elegidas por el dealer (vacío = automáticas)
};

const groupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, default: '', maxlength: 200 },
    emoji: { type: String, default: '♠️' },
    color: { type: String, default: '#10b981' },
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    inviteCode: { type: String, unique: true },
    defaults: settingsSchema,
    defaultDealerId: { type: Types.ObjectId, ref: 'User' },
    activeTableCode: { type: String, default: null },
  },
  { timestamps: true },
);

// La mesa guarda su estado de juego completo (Mixed) para sobrevivir reinicios de pm2.
const tableSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: 'Mesa' },
    groupId: { type: Types.ObjectId, ref: 'Group', default: null },
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    dealerId: { type: Types.ObjectId, ref: 'User' },
    settings: settingsSchema,
    seats: { type: Array, default: [] },
    status: { type: String, enum: ['waiting', 'playing', 'closed'], default: 'waiting' },
    buttonUserId: { type: String, default: null },
    handNo: { type: Number, default: 0 },
    hand: { type: Schema.Types.Mixed, default: null },
    closedAt: Date,
  },
  { timestamps: true, minimize: false },
);

const handSchema = new Schema(
  {
    tableId: { type: Types.ObjectId, ref: 'Table', index: true },
    groupId: { type: Types.ObjectId, ref: 'Group', index: true, default: null },
    no: Number,
    board: [String],
    potTotal: Number,
    players: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        committed: Number,
        won: Number,
        net: Number,
        folded: Boolean,
        cards: [String],
        handName: String,
      },
    ],
    winners: [{ type: Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

// Una fila por jugador y mano: base de todos los rankings.
const playerHandSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', index: true },
    groupId: { type: Types.ObjectId, ref: 'Group', index: true, default: null },
    tableId: { type: Types.ObjectId, ref: 'Table' },
    handId: { type: Types.ObjectId, ref: 'Hand' },
    committed: Number,
    won: Number,
    net: Number,
    showdown: Boolean,
    winner: Boolean,
  },
  { timestamps: true },
);

export const User = model('User', userSchema);
export const Group = model('Group', groupSchema);
export const Table = model('Table', tableSchema);
export const Hand = model('Hand', handSchema);
export const PlayerHand = model('PlayerHand', playerHandSchema);
