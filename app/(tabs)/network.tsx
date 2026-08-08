import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Image, ActivityIndicator, Alert, Clipboard, Modal } from "react-native";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { doc, writeBatch, arrayUnion, arrayRemove } from "firebase/firestore";
import { dbGetDoc, dbGetDocsInBatches, dbSetDoc } from "../../lib/firestoreQuery";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Search, UserPlus, Check, X, Clipboard as ClipboardIcon, Share2, AlertCircle, Camera } from "lucide-react-native";
import QRCode from "qrcode";
import { CameraView, useCameraPermissions } from "expo-camera";

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

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

  const [showScanModal, setShowScanModal] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scannedUser, setScannedUser] = useState<any | null>(null);
  const [searchingScan, setSearchingScan] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "found" | "not_found">("idle");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const connectUrl = profile?.username ? `equaris://network?connect=${encodeURIComponent(profile.username)}` : "";

  useEffect(() => {
    if (connectUrl) {
      QRCode.toDataURL(connectUrl, { margin: 1, width: 300 })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error("Error generating local QR:", err));
    } else {
      setQrCodeDataUrl("");
    }
  }, [connectUrl]);

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Scan QR Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Scan Connection QR</Text>
        <Text style={styles.cardDesc}>Connect instantly with others. Scan a friend's QR code to view profile and add connection.</Text>
        <Pressable style={styles.scanBtn} onPress={openScanModal}>
          <Share2 size={16} color={Colors.primaryForeground} style={{ marginRight: 6 }} />
          <Text style={styles.scanBtnText}>Scan QR Code</Text>
        </Pressable>
      </View>

      {/* QR Code Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Connect QR</Text>
        <Text style={styles.cardDesc}>Ask a friend to scan this QR code inside their camera or share your connect link.</Text>
        
        {qrCodeDataUrl ? (
          <View style={styles.qrContainer}>
            <Image source={{ uri: qrCodeDataUrl }} style={styles.qrImage} />
            <Pressable style={styles.shareBtn} onPress={copyConnectLink}>
              <ClipboardIcon size={16} color={Colors.foreground} style={{ marginRight: 6 }} />
              <Text style={styles.shareBtnText}>Copy Connection Code</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color={Colors.primary} />
        )}
      </View>

      {/* Incoming Requests List */}
      {incomingProfiles.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Incoming Requests ({incomingProfiles.length})</Text>
          {incomingProfiles.map((req) => (
            <View key={req.uid} style={styles.friendRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{req.name}</Text>
                <Text style={styles.userHandle}>@{req.username}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
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
                <X size={20} color={Colors.foreground} />
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
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: 10 }} />
              )}

              {scanStatus === "found" && scannedUser && (
                <View style={styles.scannedProfileCard}>
                  <View style={{ alignItems: "center", gap: 6, marginVertical: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "bold", color: Colors.foreground }}>
                      {scannedUser.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "bold" }}>
                      @{scannedUser.username}
                    </Text>
                    {scannedUser.upiId ? (
                      <Text style={{ fontSize: 11, color: Colors.mutedForeground }}>
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
  scanBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 6,
  },
  scanBtnText: {
    color: Colors.primaryForeground,
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
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
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
    borderBottomColor: Colors.border,
    paddingBottom: 10,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  scannedProfileCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.background,
    padding: 16,
    width: "100%",
    alignItems: "center",
  },
  connectBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  connectBtnText: {
    color: Colors.primaryForeground,
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
    backgroundColor: Colors.border,
    borderRadius: 12,
    marginBottom: 10,
  },
  noPermissionText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    textAlign: "center",
    marginBottom: 10,
  },
  permissionBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
});
