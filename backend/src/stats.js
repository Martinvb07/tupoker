import mongoose from 'mongoose';
import { PlayerHand, Hand } from './models.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

const SORTS = {
  net: { net: -1 },
  wagered: { wagered: -1 },
  lost: { lost: -1 },
  won: { winnings: -1 },
  hands: { hands: -1 },
  winRate: { winRate: -1, hands: -1 },
  biggestPot: { biggestPot: -1 },
};

const userStatsGroup = {
  _id: '$userId',
  hands: { $sum: 1 },
  wagered: { $sum: '$committed' },
  collected: { $sum: '$won' },
  net: { $sum: '$net' },
  winnings: { $sum: { $cond: [{ $gt: ['$net', 0] }, '$net', 0] } },
  lost: { $sum: { $cond: [{ $lt: ['$net', 0] }, { $multiply: ['$net', -1] }, 0] } },
  handsWon: { $sum: { $cond: ['$winner', 1, 0] } },
  showdowns: { $sum: { $cond: ['$showdown', 1, 0] } },
  biggestPot: { $max: '$won' },
  tables: { $addToSet: '$tableId' },
  lastPlayed: { $max: '$createdAt' },
};

const userStatsProject = {
  hands: 1, wagered: 1, collected: 1, net: 1, winnings: 1, lost: 1, handsWon: 1, showdowns: 1, biggestPot: 1, lastPlayed: 1,
  sessions: { $size: '$tables' },
  winRate: { $cond: [{ $gt: ['$hands', 0] }, { $multiply: [{ $divide: ['$handsWon', '$hands'] }, 100] }, 0] },
};

export async function userRanking({ groupId = null, sort = 'net', limit = 100 } = {}) {
  const match = groupId ? { groupId: oid(groupId) } : {};
  const rows = await PlayerHand.aggregate([
    { $match: match },
    { $group: userStatsGroup },
    { $project: userStatsProject },
    { $sort: SORTS[sort] || SORTS.net },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
  ]);
  return rows.map(({ user, _id, ...s }) => ({
    ...s,
    user: {
      id: _id.toString(),
      username: user.username,
      displayName: user.displayName || user.username,
      avatarUrl: user.avatarUrl,
      avatarColor: user.avatarColor,
    },
  }));
}

export async function userStats(userId, groupId = null) {
  const match = { userId: oid(userId) };
  if (groupId) match.groupId = oid(groupId);
  const [row] = await PlayerHand.aggregate([{ $match: match }, { $group: userStatsGroup }, { $project: userStatsProject }]);
  const empty = { hands: 0, wagered: 0, collected: 0, net: 0, winnings: 0, lost: 0, handsWon: 0, showdowns: 0, biggestPot: 0, sessions: 0, winRate: 0 };
  const recent = await PlayerHand.find(match).sort({ createdAt: -1 }).limit(60).select('net createdAt').lean();
  return { ...(row ? { ...row, _id: undefined } : empty), trend: recent.reverse().map((r) => r.net) };
}

export async function groupRanking({ sort = 'volume', limit = 50 } = {}) {
  const sorts = { volume: { volume: -1 }, hands: { hands: -1 }, biggestPot: { biggestPot: -1 }, players: { players: -1 } };
  const rows = await Hand.aggregate([
    { $match: { groupId: { $ne: null } } },
    {
      $group: {
        _id: '$groupId',
        hands: { $sum: 1 },
        volume: { $sum: '$potTotal' },
        biggestPot: { $max: '$potTotal' },
        tables: { $addToSet: '$tableId' },
        players: { $addToSet: '$players.userId' },
        lastPlayed: { $max: '$createdAt' },
      },
    },
    {
      $project: {
        hands: 1, volume: 1, biggestPot: 1, lastPlayed: 1,
        sessions: { $size: '$tables' },
        players: { $size: { $reduce: { input: '$players', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } },
      },
    },
    { $sort: sorts[sort] || sorts.volume },
    { $limit: limit },
    { $lookup: { from: 'groups', localField: '_id', foreignField: '_id', as: 'group' } },
    { $unwind: '$group' },
  ]);
  return rows.map(({ group, _id, ...s }) => ({
    ...s,
    group: { id: _id.toString(), name: group.name, emoji: group.emoji, color: group.color, members: group.members.length },
  }));
}
