import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Image, ActivityIndicator, Alert, Clipboard, Modal, Animated } from "react-native";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { doc, writeBatch, arrayUnion, arrayRemove } from "firebase/firestore";
import { dbGetDoc, dbGetDocsInBatches } from "../../lib/firestoreQuery";
import { useTheme } from "../../lib/ThemeContext";
import { AppColors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Search, UserPlus, Check, X, Clipboard as ClipboardIcon, Share2, AlertCircle, Camera, Clock } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import { CameraView, useCameraPermissions } from "expo-camera";

import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NetworkScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
  const { user, profile } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedUser, setSearchedUser] = useState<any | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "found" | "not_found">("idle");
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  const [friendsProfiles, setFriendsProfiles] = useState<any[]>([]);
  const [incomingProfiles, setIncomingProfiles] = useState<any[]>([]);
  const [outgoingProfiles, setOutgoingProfiles] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const [showScanModal, setShowScanModal] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scannedUser, setScannedUser] = useState<any | null>(null);
  const [searchingScan, setSearchingScan] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "found" | "not_found">("idle");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    translateYAnim.setValue(6);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const connectUrl = profile?.username ? `equaris://network?connect=${encodeURIComponent(profile.username)}` : "";

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
    setFeedback(null);

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
      setFeedback({ text: "Username search failed.", error: true });
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    setBusyUid(targetUid);
    setFeedback(null);
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
      setFeedback({ text: `Connection request sent to @${searchedUser?.username || "user"}!`, error: false });
      setSearchStatus("idle");
      setSearchQuery("");
      setSearchedUser(null);
    } catch (err) {
      console.error(err);
      setFeedback({ text: "Failed to send request.", error: true });
    } finally {
      setBusyUid(null);
    }
  };

  const cancelOutgoingRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    setBusyUid(targetUid);
    setFeedback(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), {
        sentRequests: arrayRemove(targetUid)
      });
      batch.update(doc(db, "users", targetUid), {
        receivedRequests: arrayRemove(user.uid)
      });
      await batch.commit();
      setFeedback({ text: "Outbound connection request cancelled.", error: false });
      if (searchedUser && searchedUser.uid === targetUid) {
        setSearchedUser(null);
        setSearchStatus("idle");
      }
    } catch (err) {
      console.error(err);
      setFeedback({ text: "Failed to cancel request.", error: true });
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

  const resolveProfileForText = async (text: string) => {
    let targetUsername = text.trim();
    if (targetUsername.includes("connect=")) {
      const parts = targetUsername.split("connect=");
      targetUsername = parts[parts.length - 1];
    }
    const clean = targetUsername.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!clean) return;

    setSearchingScan(true);
    setScannedUser(null);
    setScanStatus("idle");

    try {
      const snap = await dbGetDoc("usernames", clean);
      if (snap && snap.exists()) {
        const uid = snap.data()?.uid;
        if (uid === user?.uid) {
          Alert.alert("Notice", "That is your own username.");
          setScanStatus("idle");
          return;
        }
        const profileSnap = await dbGetDoc("profiles", uid);
        if (profileSnap && profileSnap.exists()) {
          setScannedUser(profileSnap.data());
          setScanStatus("found");
        } else {
          setScanStatus("not_found");
        }
      } else {
        setScanStatus("not_found");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to resolve connection link.");
    } finally {
      setSearchingScan(false);
    }
  };

  const handleScanLink = async () => {
    await resolveProfileForText(scanInput);
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScanInput(data);
    await resolveProfileForText(data);
  };

  const handleConnectScanned = async () => {
    if (!scannedUser) return;
    await sendFriendRequest(scannedUser.uid);
    setShowScanModal(false);
    setScanInput("");
    setScannedUser(null);
    setScanStatus("idle");
    setScanned(false);
  };

  const openScanModal = async () => {
    setShowScanModal(true);
    setScanned(false);
    if (!permission || !permission.granted) {
      await requestPermission();
    }
  };

  const getRelationStatus = (uid: string) => {
    if (profile?.friends?.includes(uid)) return "friend";
    if (profile?.sentRequests?.includes(uid)) return "outgoing";
    if (profile?.receivedRequests?.includes(uid)) return "incoming";
    return "none";
  };

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateYAnim }] }}>
      <ScrollView contentContainerStyle={styles.container}>
      {/* Search Section */}
      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Text style={styles.cardTitle}>SEARCH ACCOUNTS BY HANDLE</Text>
          <Search size={14} color={colors.foreground} style={{ marginBottom: 6 }} />
        </View>
        
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Text style={styles.searchInputPrefix}>@</Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="werty"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Pressable style={styles.searchBtn} onPress={handleSearch} disabled={searching}>
            {searching ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Search size={14} color={colors.primaryForeground} />
                <Text style={styles.findBtnText}>FIND</Text>
              </View>
            )}
          </Pressable>
        </View>

        {searchStatus === "found" && searchedUser && (
          <View style={styles.searchResultCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {searchedUser.name ? searchedUser.name.charAt(0).toUpperCase() : "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultNameText}>{searchedUser.name}</Text>
              <Text style={styles.resultHandleText}>@{searchedUser.username}</Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>Connect to view UPI</Text>
            </View>
            <View>
              {(() => {
                const relation = getRelationStatus(searchedUser.uid);
                if (relation === "friend") {
                  return (
                    <View style={styles.friendBadge}>
                      <Check size={12} color={colors.success} />
                      <Text style={styles.friendBadgeText}>CONNECTED</Text>
                    </View>
                  );
                }
                if (relation === "outgoing") {
                  return (
                    <View style={styles.requestSentBadge}>
                      <Clock size={12} color={colors.gold} />
                      <Text style={styles.requestSentText}>REQUEST SENT</Text>
                      <Text style={styles.badgeDivider}>•</Text>
                      <Pressable onPress={() => cancelOutgoingRequest(searchedUser.uid)}>
                        <Text style={styles.cancelRequestBtnText}>CANCEL</Text>
                      </Pressable>
                    </View>
                  );
                }
                if (relation === "incoming") {
                  return (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        style={[styles.miniBtn, { backgroundColor: colors.success }]}
                        onPress={() => acceptFriendRequest(searchedUser.uid)}
                        disabled={busyUid !== null}
                      >
                        <Check size={16} color={colors.successForeground} />
                      </Pressable>
                      <Pressable
                        style={[styles.miniBtn, { backgroundColor: colors.destructive }]}
                        onPress={() => declineFriendRequest(searchedUser.uid)}
                        disabled={busyUid !== null}
                      >
                        <X size={16} color={colors.primaryForeground} />
                      </Pressable>
                    </View>
                  );
                }
                return (
                  <Pressable style={styles.connectActionBtn} onPress={() => sendFriendRequest(searchedUser.uid)} disabled={busyUid !== null}>
                    {busyUid === searchedUser.uid ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <>
                        <UserPlus size={14} color={colors.primaryForeground} style={{ marginRight: 4 }} />
                        <Text style={styles.connectActionBtnText}>CONNECT</Text>
                      </>
                    )}
                  </Pressable>
                );
              })()}
            </View>
          </View>
        )}

        {searchStatus === "not_found" && (
          <Text style={styles.notFoundText}>Could not find user with that username.</Text>
        )}

        {feedback && (
          <View style={[styles.feedbackBanner, feedback.error ? styles.feedbackError : styles.feedbackSuccess]}>
            {feedback.error ? (
              <AlertCircle size={16} color={colors.destructive} style={{ marginRight: 6 }} />
            ) : (
              <Check size={16} color={colors.success} style={{ marginRight: 6 }} />
            )}
            <Text style={[styles.feedbackText, feedback.error ? styles.textError : styles.textSuccess]}>
              {feedback.text}
            </Text>
          </View>
        )}
      </View>

      {/* QR Code Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Connect QR</Text>
        <Text style={styles.cardDesc}>Ask a friend to scan this QR code inside their camera or share your connect link.</Text>
        
        {connectUrl ? (
          <View style={styles.qrContainer}>
            <View style={styles.qrImageContainer}>
              <QRCode
                value={connectUrl}
                size={180}
                color={colors.foreground}
                backgroundColor={colors.card}
              />
            </View>
            <Pressable style={styles.shareBtn} onPress={copyConnectLink}>
              <ClipboardIcon size={16} color={colors.foreground} style={{ marginRight: 6 }} />
              <Text style={styles.shareBtnText}>Copy Connection Code</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>

      {/* Scan QR Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Scan Connection QR</Text>
        <Text style={styles.cardDesc}>Connect instantly with others. Scan a friend's QR code to view profile and add connection.</Text>
        <Pressable style={styles.scanBtn} onPress={openScanModal}>
          <Share2 size={16} color={colors.primaryForeground} style={{ marginRight: 6 }} />
          <Text style={styles.scanBtnText}>Scan QR Code</Text>
        </Pressable>
      </View>

      {/* Incoming Requests List */}
      {incomingProfiles.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Incoming Requests ({incomingProfiles.length})</Text>
          {incomingProfiles.map((req) => (
            <View key={req.uid} style={styles.friendRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {req.name ? req.name.charAt(0).toUpperCase() : "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{req.name}</Text>
                <Text style={styles.userHandle}>@{req.username}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  style={[styles.miniBtn, { backgroundColor: colors.success }]}
                  onPress={() => acceptFriendRequest(req.uid)}
                  disabled={busyUid !== null}
                >
                  <Check size={16} color={colors.successForeground} />
                </Pressable>
                <Pressable
                  style={[styles.miniBtn, { backgroundColor: colors.destructive }]}
                  onPress={() => declineFriendRequest(req.uid)}
                  disabled={busyUid !== null}
                >
                  <X size={16} color={colors.primaryForeground} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Sent Requests List */}
      {outgoingProfiles.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sent Requests ({outgoingProfiles.length})</Text>
          {outgoingProfiles.map((req) => (
            <View key={req.uid} style={styles.friendRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {req.name ? req.name.charAt(0).toUpperCase() : "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{req.name}</Text>
                <Text style={styles.userHandle}>@{req.username}</Text>
              </View>
              <Pressable
                style={styles.cancelRequestBtn}
                onPress={() => cancelOutgoingRequest(req.uid)}
                disabled={busyUid !== null}
              >
                <Text style={styles.cancelRequestBtnLabel}>CANCEL</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Active Friends List */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Friends ({friendsProfiles.length})</Text>
        {loadingLists ? (
          <ActivityIndicator color={colors.primary} />
        ) : friendsProfiles.length === 0 ? (
          <Text style={styles.emptyText}>You haven't added any peers yet.</Text>
        ) : (
          friendsProfiles.map((friend) => (
            <View key={friend.uid} style={styles.friendRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {friend.name ? friend.name.charAt(0).toUpperCase() : "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{friend.name}</Text>
                <Text style={styles.userHandle}>@{friend.username}</Text>
              </View>
              <View style={styles.friendBadge}>
                <Check size={12} color={colors.success} />
                <Text style={styles.friendBadgeText}>CONNECTED</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Scan QR Modal */}
      <Modal visible={showScanModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scan Connection QR</Text>
              <Pressable onPress={() => {
                setShowScanModal(false);
                setScanInput("");
                setScannedUser(null);
                setScanStatus("idle");
                setScanned(false);
              }}>
                <X size={20} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={{ gap: 16, width: "100%", paddingBottom: 20 }}>
              {permission && permission.granted ? (
                <View style={styles.cameraContainer}>
                  <CameraView
                    style={styles.camera}
                    onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    barcodeScannerSettings={{
                      barcodeTypes: ["qr"],
                    }}
                  />
                  {scanned && (
                    <Pressable style={styles.rescanBtn} onPress={() => setScanned(false)}>
                      <Text style={styles.rescanBtnText}>Scan Again</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={styles.noPermissionContainer}>
                  <Text style={styles.noPermissionText}>Camera permission is required to scan QR codes.</Text>
                  <Pressable style={styles.permissionBtn} onPress={requestPermission}>
                    <Text style={styles.permissionBtnText}>Grant Permission</Text>
                  </Pressable>
                </View>
              )}

              {searchingScan && (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
              )}

              {scanStatus === "found" && scannedUser && (
                <View style={styles.scannedProfileCard}>
                  <View style={{ alignItems: "center", gap: 6, marginVertical: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "bold", color: colors.foreground }}>
                      {scannedUser.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "bold" }}>
                      @{scannedUser.username}
                    </Text>
                    {scannedUser.upiId ? (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        UPI: {scannedUser.upiId}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable style={styles.connectBtn} onPress={handleConnectScanned} disabled={busyUid !== null}>
                    <Text style={styles.connectBtnText}>Connect & Add Friend</Text>
                  </Pressable>
                </View>
              )}

              {scanStatus === "not_found" && (
                <Text style={styles.notFoundText}>Could not resolve a profile for this link.</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  </Animated.View>
);
}

function createStyles(colors: AppColors) { return StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.glassCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    lineHeight: 16,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
  },
  searchInputPrefix: {
    fontSize: Typography.fontSize.sm,
    color: colors.mutedForeground,
    marginRight: 2,
    fontWeight: "bold",
  },
  searchInput: {
    flex: 1,
    height: "100%",
    color: colors.foreground,
    fontSize: Typography.fontSize.sm,
  },
  searchBtn: {
    height: 44,
    backgroundColor: colors.foreground,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  findBtnText: {
    color: colors.background,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  searchResultCard: {
    marginTop: 15,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.foreground,
  },
  resultNameText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: colors.foreground,
  },
  resultHandleText: {
    fontSize: Typography.fontSize.xs,
    color: colors.primary,
    fontWeight: "bold",
  },
  friendBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef6f4",
    borderWidth: 1,
    borderColor: "#cde5e0",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  friendBadgeText: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.success,
  },
  requestSentBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffdf0",
    borderWidth: 1,
    borderColor: "#fceea7",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  requestSentText: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.gold,
  },
  badgeDivider: {
    fontSize: 9,
    color: colors.gold,
  },
  cancelRequestBtnText: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.gold,
    textDecorationLine: "underline",
  },
  connectActionBtn: {
    backgroundColor: colors.foreground,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectActionBtnText: {
    color: colors.background,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  cancelRequestBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelRequestBtnLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: colors.destructive,
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 15,
  },
  feedbackSuccess: {
    backgroundColor: "#eef6f4",
    borderColor: "#cde5e0",
  },
  feedbackError: {
    backgroundColor: "#fdf3f2",
    borderColor: "#f9d7d5",
  },
  feedbackText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "600",
    flex: 1,
  },
  textSuccess: {
    color: colors.success,
  },
  textError: {
    color: colors.destructive,
  },
  qrImageContainer: {
    padding: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  notFoundText: {
    fontSize: Typography.fontSize.xs,
    color: colors.destructive,
    marginTop: 10,
  },
  qrContainer: {
    alignItems: "center",
    gap: 12,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  shareBtnText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "semibold",
    color: colors.foreground,
  },
  userName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: colors.foreground,
  },
  userHandle: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
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
    borderBottomColor: colors.border,
  },
  emptyText: {
    textAlign: "center",
    color: colors.mutedForeground,
    fontSize: Typography.fontSize.sm,
    paddingVertical: 20,
  },
  scanBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 6,
  },
  scanBtnText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    width: "100%",
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: colors.foreground,
  },
  scannedProfileCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
    padding: 16,
    width: "100%",
    alignItems: "center",
  },
  connectBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  connectBtnText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  cameraContainer: {
    width: "100%",
    height: 240,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 10,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  rescanBtn: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  rescanBtnText: {
    color: "#fff",
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  noPermissionContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    backgroundColor: colors.border,
    borderRadius: 12,
    marginBottom: 10,
  },
  noPermissionText: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: 10,
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
}); }
