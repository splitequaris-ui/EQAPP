import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Image, ActivityIndicator, Alert, Clipboard } from "react-native";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { doc, writeBatch, arrayUnion, arrayRemove } from "firebase/firestore";
import { dbGetDoc, dbGetDocsInBatches, dbSetDoc } from "../../lib/firestoreQuery";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Search, UserPlus, Check, X, Clipboard as ClipboardIcon, Share2, AlertCircle } from "lucide-react-native";

export default function NetworkScreen() {
  const { user, profile } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedUser, setSearchedUser] = useState<any | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "found" | "not_found">("idle");

  const [friendsProfiles, setFriendsProfiles] = useState<any[]>([]);
  const [incomingProfiles, setIncomingProfiles] = useState<any[]>([]);
  const [outgoingProfiles, setOutgoingProfiles] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const connectUrl = profile?.username ? `equaris://network?connect=${encodeURIComponent(profile.username)}` : "";
  const qrCodeUrl = connectUrl ? `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(connectUrl)}` : "";

  const loadLists = async () => {
    if (!user || !profile) return;
    setLoadingLists(true);
    try {
      if (profile.friends && profile.friends.length > 0) {
        const list = await dbGetDocsInBatches("profiles", "uid", profile.friends);
        setFriendsProfiles(list || []);
      } else {
        setFriendsProfiles([]);
      }

      if (profile.receivedRequests && profile.receivedRequests.length > 0) {
        const list = await dbGetDocsInBatches("profiles", "uid", profile.receivedRequests);
        setIncomingProfiles(list || []);
      } else {
        setIncomingProfiles([]);
      }

      if (profile.sentRequests && profile.sentRequests.length > 0) {
        const list = await dbGetDocsInBatches("profiles", "uid", profile.sentRequests);
        setOutgoingProfiles(list || []);
      } else {
        setOutgoingProfiles([]);
      }
    } catch (err) {
      console.error("Failed to load network lists", err);
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    loadLists();
  }, [profile?.friends, profile?.receivedRequests, profile?.sentRequests]);

  const handleSearch = async () => {
    const clean = searchQuery.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!clean) return;
    setSearching(true);
    setSearchedUser(null);
    setSearchStatus("idle");

    try {
      const snap = await dbGetDoc("usernames", clean);
      if (snap && snap.exists()) {
        const uid = snap.data()?.uid;
        if (uid === user?.uid) {
          Alert.alert("Notice", "That is your own username.");
          setSearchStatus("idle");
          return;
        }
        const profileSnap = await dbGetDoc("profiles", uid);
        if (profileSnap && profileSnap.exists()) {
          setSearchedUser(profileSnap.data());
          setSearchStatus("found");
        } else {
          setSearchStatus("not_found");
        }
      } else {
        setSearchStatus("not_found");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Username search failed.");
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    setBusyUid(targetUid);
    try {
      const batch = writeBatch(db);
      // Add target uid to current user's sentRequests
      batch.update(doc(db, "users", user.uid), {
        sentRequests: arrayUnion(targetUid)
      });
      // Add current user's uid to target user's receivedRequests
      batch.update(doc(db, "users", targetUid), {
        receivedRequests: arrayUnion(user.uid)
      });

      await batch.commit();
      Alert.alert("Success", "Connection request sent!");
      setSearchStatus("idle");
      setSearchQuery("");
      setSearchedUser(null);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to send request.");
    } finally {
      setBusyUid(null);
    }
  };

  const acceptFriendRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    setBusyUid(targetUid);
    try {
      const batch = writeBatch(db);
      
      // Move target from receivedRequests to friends in current user profile
      batch.update(doc(db, "users", user.uid), {
        receivedRequests: arrayRemove(targetUid),
        friends: arrayUnion(targetUid)
      });

      // Move current user from sentRequests to friends in target profile
      batch.update(doc(db, "users", targetUid), {
        sentRequests: arrayRemove(user.uid),
        friends: arrayUnion(user.uid)
      });

      await batch.commit();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to accept request.");
    } finally {
      setBusyUid(null);
    }
  };

  const declineFriendRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    setBusyUid(targetUid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), {
        receivedRequests: arrayRemove(targetUid)
      });
      batch.update(doc(db, "users", targetUid), {
        sentRequests: arrayRemove(user.uid)
      });
      await batch.commit();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to decline request.");
    } finally {
      setBusyUid(null);
    }
  };

  const copyConnectLink = () => {
    if (connectUrl) {
      Clipboard.setString(connectUrl);
      Alert.alert("Copied", "Your connection code has been copied to clipboard!");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Search Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add Peers by Username</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search username (e.g. parth_tyagi)"
            placeholderTextColor={Colors.mutedForeground}
            autoCapitalize="none"
          />
          <Pressable style={styles.searchBtn} onPress={handleSearch} disabled={searching}>
            {searching ? (
              <ActivityIndicator color={Colors.primaryForeground} />
            ) : (
              <Search size={18} color={Colors.primaryForeground} />
            )}
          </Pressable>
        </View>

        {searchStatus === "found" && searchedUser && (
          <View style={styles.searchResult}>
            <Text style={styles.resultName}>{searchedUser.name}</Text>
            <Text style={styles.resultUsername}>@{searchedUser.username}</Text>
            <Pressable
              style={styles.addBtn}
              onPress={() => sendFriendRequest(searchedUser.uid)}
              disabled={busyUid !== null}
            >
              <UserPlus size={16} color={Colors.primaryForeground} style={{ marginRight: 6 }} />
              <Text style={styles.addBtnText}>Connect</Text>
            </Pressable>
          </View>
        )}

        {searchStatus === "not_found" && (
          <Text style={styles.notFoundText}>No user found with that username.</Text>
        )}
      </View>

      {/* QR Code Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Connect QR</Text>
        <Text style={styles.cardDesc}>Ask a friend to scan this QR code inside their camera or share your connect link.</Text>
        
        {qrCodeUrl ? (
          <View style={styles.qrContainer}>
            <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} />
            <Pressable style={styles.shareBtn} onPress={copyConnectLink}>
              <ClipboardIcon size={16} color={Colors.foreground} style={{ marginRight: 6 }} />
              <Text style={styles.shareBtnText}>Copy Connection Code</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color={Colors.primary} />
        )}
      </View>

      {/* Incoming Requests */}
      {incomingProfiles.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Incoming Requests</Text>
          {incomingProfiles.map((req) => (
            <View key={req.uid} style={styles.userRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{req.name}</Text>
                <Text style={styles.userHandle}>@{req.username}</Text>
              </View>
              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.miniBtn, { backgroundColor: Colors.success }]}
                  onPress={() => acceptFriendRequest(req.uid)}
                  disabled={busyUid !== null}
                >
                  <Check size={16} color={Colors.successForeground} />
                </Pressable>
                <Pressable
                  style={[styles.miniBtn, { backgroundColor: Colors.destructive }]}
                  onPress={() => declineFriendRequest(req.uid)}
                  disabled={busyUid !== null}
                >
                  <X size={16} color={Colors.primaryForeground} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Active Friends List */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Friends ({friendsProfiles.length})</Text>
        {loadingLists ? (
          <ActivityIndicator color={Colors.primary} />
        ) : friendsProfiles.length === 0 ? (
          <Text style={styles.emptyText}>You haven't added any peers yet.</Text>
        ) : (
          friendsProfiles.map((friend) => (
            <View key={friend.uid} style={styles.friendRow}>
              <View>
                <Text style={styles.userName}>{friend.name}</Text>
                <Text style={styles.userHandle}>@{friend.username}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: Colors.background,
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    lineHeight: 16,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
    color: Colors.foreground,
    fontSize: Typography.fontSize.sm,
  },
  searchBtn: {
    width: 44,
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResult: {
    marginTop: 15,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
    flexDirection: "row",
    alignItems: "center",
  },
  resultName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
    flex: 1,
  },
  resultUsername: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginRight: 10,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  notFoundText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.destructive,
    marginTop: 10,
  },
  qrContainer: {
    alignItems: "center",
    gap: 12,
  },
  qrImage: {
    width: 180,
    height: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  shareBtnText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "semibold",
    color: Colors.foreground,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 8,
  },
  userName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  userHandle: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  emptyText: {
    textAlign: "center",
    color: Colors.mutedForeground,
    fontSize: Typography.fontSize.sm,
    paddingVertical: 20,
  },
});
