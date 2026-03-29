import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../../firebase'; // Firebase yolunu kontrol et

// Bildirimlerin ekranda nasıl görüneceğini ayarlıyoruz
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// --- BİLDİRİM GÖNDERME MOTORU ---
async function sendPushNotification(expoPushToken, title, body) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: { someData: 'goes here' },
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

// --- TEKİL LİSTE ELEMANI BİLEŞENİ ---
const ListItem = ({ item, activeListId, userName }) => {
  const [priceInput, setPriceInput] = useState('');

  const markAsBought = async () => {
    if (!priceInput.trim() || isNaN(priceInput)) {
      Alert.alert("Eksik Bilgi", "Lütfen geçerli bir fiyat girin!");
      return;
    }
    await updateDoc(doc(db, activeListId, item.id), {
      completed: true,
      buyer: userName,
      price: parseFloat(priceInput)
    });
  };

  const deleteItem = async () => {
    Alert.alert("Emin misin?", "Bu ürünü silmek istiyor musun?", [
      { text: "İptal", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: async () => await deleteDoc(doc(db, activeListId, item.id)) }
    ]);
  };

  return (
    <View style={[styles.itemCard, item.completed && styles.itemCardCompleted]}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemText, item.completed && styles.completedText]}>{item.text}</Text>
        {!item.completed && (
          <TouchableOpacity onPress={deleteItem} style={styles.deleteIcon}>
            <Text style={styles.deleteIconText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {!item.completed ? (
        <View style={styles.actionRow}>
          <TextInput
            style={styles.priceInput}
            placeholder="Fiyat (₺)"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={priceInput}
            onChangeText={setPriceInput}
          />
          <TouchableOpacity style={styles.buyButton} onPress={markAsBought}>
            <Text style={styles.buyButtonText}>Aldım</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.buyerInfo}>✓ {item.buyer} aldı ({item.price} ₺)</Text>
      )}
    </View>
  );
};

// --- ANA UYGULAMA BİLEŞENİ ---
export default function App() {
  const [userName, setUserName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState('');
  const [newListName, setNewListName] = useState('');
  const [newMemberName, setNewMemberName] = useState('');

  const [viewMode, setViewMode] = useState('list');
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // YENİ: Ayarlar ve Bildirim State'leri
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState('');

  // --- BİLDİRİM İZNİ VE KAYIT ---
  useEffect(() => {
    if (isLoggedIn) {
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          setExpoPushToken(token);
          // Kullanıcının token'ını ve tercihini Firebase'e "Users" koleksiyonuna kaydet
          setDoc(doc(db, 'Users', userName), {
            token: token,
            notificationsEnabled: notificationsEnabled
          }, { merge: true });
        }
      });
    }
  }, [isLoggedIn, notificationsEnabled]);

  async function registerForPushNotificationsAsync() {
    let token;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Bildirim izni alınamadı!');
        return;
      }
      token = (await Notifications.getExpoPushTokenAsync({ projectId: 'your-project-id' })).data;
    } else {
      console.log('Fiziksel bir cihaz kullanmalısınız (Web/Emülatörde Push çalışmaz).');
    }
    return token;
  }

  // Ayarları değiştirdiğimizde Firebase'i de güncelle
  const toggleSwitch = async () => {
    const newVal = !notificationsEnabled;
    setNotificationsEnabled(newVal);
    if (userName) {
      await setDoc(doc(db, 'Users', userName), { notificationsEnabled: newVal }, { merge: true });
    }
  };

  // --- LİSTE VE ÜYE ÇEKME İŞLEMLERİ ---
  useEffect(() => {
    if (!isLoggedIn) return; 
    const q = query(collection(db, 'AllLists'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const listData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const myLists = listData.filter(list => list.members && list.members.includes(userName));
      setLists(myLists);
      
      if (myLists.length > 0 && !myLists.find(l => l.id === activeListId)) {
        setActiveListId(myLists[0].id);
      } else if (myLists.length === 0) {
        setActiveListId('');
      }
    });
    return () => unsubscribe();
  }, [isLoggedIn, userName, activeListId]);

  useEffect(() => {
    if (!activeListId) { setItems([]); return; }
    const q = query(collection(db, activeListId), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(list);
    });
    return () => unsubscribe();
  }, [activeListId]);

  useEffect(() => {
    if (!activeListId) { setMessages([]); return; }
    const q = query(collection(db, activeListId + '_chat'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [activeListId]);

  // --- GENEL FONKSİYONLAR ---
  const activeListObj = lists.find(l => l.id === activeListId);

  // Ortak bildirim gönderme fonksiyonu (Listede benden başka herkese at)
  const notifyOtherMembers = async (title, body) => {
    if (!activeListObj || !activeListObj.members) return;
    
    for (const member of activeListObj.members) {
      if (member !== userName) {
        const userDoc = await getDoc(doc(db, 'Users', member));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Eğer kullanıcının token'ı varsa ve bildirimleri açıksa gönder
          if (userData.token && userData.notificationsEnabled) {
            sendPushNotification(userData.token, title, body);
          }
        }
      }
    }
  };

  const createNewList = async () => {
    if (!newListName.trim()) return;
    const docRef = await addDoc(collection(db, 'AllLists'), {
      name: newListName.trim(),
      createdAt: serverTimestamp(),
      members: [userName]
    });
    setActiveListId(docRef.id);
    setNewListName('');
  };

  const addMemberToList = async () => {
    if (!newMemberName.trim() || !activeListId) return;
    if (activeListObj && activeListObj.members && activeListObj.members.includes(newMemberName.trim())) {
      Alert.alert("Zaten Üye", `${newMemberName.trim()} zaten bu listede ekli.`);
      setNewMemberName('');
      return;
    }
    await updateDoc(doc(db, 'AllLists', activeListId), { members: arrayUnion(newMemberName.trim()) });
    
    // Listeye eklendiğini haber ver
    notifyOtherMembers("Yeni Üye!", `${userName}, ${newMemberName.trim()} adlı kişiyi ${activeListObj.name} listesine ekledi.`);
    Alert.alert("Başarılı", `${newMemberName.trim()} listeye eklendi!`);
    setNewMemberName('');
  };

  const removeMember = async (memberToRemove) => {
    if (memberToRemove === userName) {
      Alert.alert("Hata", "Kendinizi bu şekilde silemezsiniz. Lütfen listeyi silin.");
      return;
    }
    Alert.alert("Üyeyi Çıkar", `${memberToRemove} adlı kişiyi listeden çıkarmak istiyor musunuz?`, [
      { text: "İptal", style: "cancel" },
      { 
        text: "Çıkar", style: "destructive", 
        onPress: async () => {
          await updateDoc(doc(db, 'AllLists', activeListId), { members: arrayRemove(memberToRemove) });
        }
      }
    ]);
  };

  const deleteEntireList = async () => {
    Alert.alert("Listeyi Sil", "Bu liste ve içindeki her şey silinecek. Emin misiniz?", [
      { text: "İptal", style: "cancel" },
      { 
        text: "Listeyi Sil", style: "destructive", 
        onPress: async () => {
          await deleteDoc(doc(db, 'AllLists', activeListId));
          setActiveListId('');
        }
      }
    ]);
  };

  const addItem = async () => {
    if (input.trim() === '' || !activeListId) return;
    await addDoc(collection(db, activeListId), {
      text: input, completed: false, createdAt: serverTimestamp(), buyer: null, price: null
    });
    
    // DİĞER ÜYELERE BİLDİRİM AT
    notifyOtherMembers("Yeni Ürün!", `${userName}, ${activeListObj.name} listesine ekledi: ${input}`);
    setInput('');
  };

  const sendMessage = async () => {
    if (chatInput.trim() === '' || !activeListId) return;
    await addDoc(collection(db, activeListId + '_chat'), {
      text: chatInput, sender: userName, createdAt: serverTimestamp()
    });
    
    // DİĞER ÜYELERE BİLDİRİM AT
    notifyOtherMembers(`Mesaj: ${activeListObj.name}`, `${userName}: ${chatInput}`);
    setChatInput('');
  };

  const clearCompletedItems = async () => {
    Alert.alert("Alınanları Temizle", "Alınan tüm ürünler silinecek. Emin misiniz?", [
      { text: "İptal", style: "cancel" },
      { 
        text: "Temizle", style: "destructive", 
        onPress: async () => {
          const completedItems = items.filter(i => i.completed);
          for (let i of completedItems) { await deleteDoc(doc(db, activeListId, i.id)); }
        } 
      }
    ]);
  };

  const calculateTotals = () => {
    const totals = {};
    items.forEach(item => {
      if (item.completed && item.buyer && item.price) {
        totals[item.buyer] = (totals[item.buyer] || 0) + item.price;
      }
    });
    return totals;
  };

  const totals = calculateTotals();
  const hasCompletedItems = items.some(item => item.completed);

  // --- GİRİŞ EKRANI ---
  if (!isLoggedIn) {
    return (
      <View style={styles.loginScreen}>
        <Text style={styles.loginTitle}>Hoş Geldiniz 👋</Text>
        <Text style={styles.loginSub}>Listelerinize erişmek için adınızı girin</Text>
        <TextInput
          style={styles.loginInput} placeholder="Adınız Nedir? (Örn: Kayra)" placeholderTextColor="#888"
          value={userName} onChangeText={setUserName}
        />
        <TouchableOpacity style={styles.loginButton} onPress={() => userName.trim() ? setIsLoggedIn(true) : Alert.alert("Hata", "Lütfen bir isim girin.")}>
          <Text style={styles.loginButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- ANA EKRAN ---
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={20}>
      
      {/* AYARLAR MODALI */}
      <Modal visible={settingsVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.settingsModal}>
            <Text style={styles.settingsTitle}>⚙️ Ayarlar</Text>
            
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>Anlık Bildirimleri Al</Text>
              <Switch 
                trackColor={{ false: "#767577", true: "#30d158" }}
                thumbColor={notificationsEnabled ? "#fff" : "#f4f3f4"}
                onValueChange={toggleSwitch} 
                value={notificationsEnabled} 
              />
            </View>

            <TouchableOpacity style={styles.closeSettingsButton} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.closeSettingsText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.headerBar}>
        <Text style={styles.greetingText}>👤 {userName}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.settingsIconBtn}>
            <Text style={styles.settingsIconText}>⚙️ Ayarlar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsLoggedIn(false)}>
            <Text style={styles.logoutText}>Çıkış</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.createListContainer}>
        <TextInput style={styles.createListInput} placeholder="Yeni liste aç (Örn: Parti)" placeholderTextColor="#888" value={newListName} onChangeText={setNewListName} />
        <TouchableOpacity style={styles.createListButton} onPress={createNewList}>
          <Text style={styles.createListButtonText}>+ Aç</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {lists.map(list => (
            <TouchableOpacity 
              key={list.id} style={[styles.tab, activeListId === list.id && styles.activeTab]} 
              onPress={() => { setActiveListId(list.id); setViewMode('list'); }}
            >
              <Text style={[styles.tabText, activeListId === list.id && styles.activeTabText]}>📁 {list.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {activeListId ? (
        <View style={{ flex: 1 }}>
          {activeListObj && activeListObj.members && (
            <View style={styles.membersInfoContainer}>
              <Text style={styles.membersTitle}>👥 Üyeler:</Text>
              <View style={styles.membersListWrap}>
                {activeListObj.members.map(member => (
                  <View key={member} style={styles.memberTag}>
                    <Text style={styles.memberTagText}>{member}</Text>
                    {member !== userName && (
                      <TouchableOpacity onPress={() => removeMember(member)} style={styles.memberRemoveBtn}>
                        <Text style={styles.memberRemoveText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.subTabsContainer}>
            <TouchableOpacity style={[styles.subTab, viewMode === 'list' && styles.subTabActive]} onPress={() => setViewMode('list')}>
              <Text style={[styles.subTabText, viewMode === 'list' && styles.subTabTextActive]}>🛒 Liste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.subTab, viewMode === 'chat' && styles.subTabActive]} onPress={() => setViewMode('chat')}>
              <Text style={[styles.subTabText, viewMode === 'chat' && styles.subTabTextActive]}>💬 Sohbet</Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'list' ? (
            <FlatList
              data={items} renderItem={({ item }) => <ListItem item={item} activeListId={activeListId} userName={userName} />}
              keyExtractor={item => item.id} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={{ marginBottom: 10 }}>
                  <View style={styles.addMemberContainer}>
                    <TextInput style={styles.addMemberInput} placeholder="Kimi davet edeceksin?" placeholderTextColor="#888" value={newMemberName} onChangeText={setNewMemberName} />
                    <TouchableOpacity style={styles.addMemberButton} onPress={addMemberToList}>
                      <Text style={styles.addMemberButtonText}>Davet Et</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inputContainer}>
                    <TextInput style={styles.input} placeholder="Ne alınacak?" placeholderTextColor="#888" value={input} onChangeText={setInput} />
                    <TouchableOpacity style={styles.addButton} onPress={addItem}>
                      <Text style={styles.addButtonText}>Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              }
              ListFooterComponent={
                <View style={{ marginTop: 10 }}>
                  <View style={styles.summaryContainer}>
                    <Text style={styles.summaryTitle}>💰 {activeListObj?.name} Hesabı</Text>
                    {Object.keys(totals).length === 0 ? (
                      <Text style={styles.summaryText}>Henüz harcama yapılmadı.</Text>
                    ) : (
                      Object.entries(totals).map(([person, amount]) => (
                        <Text key={person} style={styles.summaryText}>• <Text style={{fontWeight: 'bold', color: '#fff'}}>{person}:</Text> {amount} ₺</Text>
                      ))
                    )}
                  </View>
                  {hasCompletedItems && (
                    <TouchableOpacity style={styles.clearButton} onPress={clearCompletedItems}>
                      <Text style={styles.clearButtonText}>🧹 Alınanları Temizle</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.deleteListButton} onPress={deleteEntireList}>
                    <Text style={styles.deleteListButtonText}>🗑️ Bu Listeyi Sil</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          ) : (
            <View style={styles.chatContainer}>
              <FlatList
                data={messages} keyExtractor={item => item.id} contentContainerStyle={{ paddingVertical: 10 }}
                renderItem={({ item }) => {
                  const isMe = item.sender === userName;
                  return (
                    <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
                      {!isMe && <Text style={styles.messageSender}>{item.sender}</Text>}
                      <Text style={styles.messageText}>{item.text}</Text>
                    </View>
                  );
                }}
              />
              <View style={styles.chatInputContainer}>
                <TextInput style={styles.chatInput} placeholder="Mesaj yaz..." placeholderTextColor="#888" value={chatInput} onChangeText={setChatInput} />
                <TouchableOpacity style={styles.chatSendButton} onPress={sendMessage}>
                  <Text style={styles.chatSendButtonText}>Gönder</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#888', fontSize: 16 }}>Görüntülenecek listeniz yok. Yeni bir liste açın!</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// STİLLER
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingTop: 40, paddingHorizontal: 20 },
  loginScreen: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  loginSub: { fontSize: 16, color: '#aaa', marginBottom: 30, textAlign: 'center' },
  loginInput: { width: '100%', backgroundColor: '#1E1E1E', color: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', marginBottom: 20, fontSize: 18 },
  loginButton: { width: '100%', backgroundColor: '#0a84ff', padding: 15, borderRadius: 10, alignItems: 'center' },
  loginButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  greetingText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  logoutText: { color: '#ff453a', fontWeight: 'bold', padding: 5 },
  settingsIconBtn: { marginRight: 15, padding: 5 },
  settingsIconText: { color: '#aaa', fontWeight: 'bold' },
  
  // Modal Stilleri
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  settingsModal: { width: '80%', backgroundColor: '#1E1E1E', borderRadius: 15, padding: 20, borderWidth: 1, borderColor: '#333' },
  settingsTitle: { fontSize: 22, color: '#fff', fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  settingText: { color: '#fff', fontSize: 16 },
  closeSettingsButton: { backgroundColor: '#0a84ff', padding: 12, borderRadius: 10, alignItems: 'center' },
  closeSettingsText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  createListContainer: { flexDirection: 'row', marginBottom: 15 },
  createListInput: { flex: 1, backgroundColor: '#1E1E1E', color: '#fff', padding: 10, borderRadius: 8, marginRight: 10, borderWidth: 1, borderColor: '#333' },
  createListButton: { backgroundColor: '#ff9f0a', paddingHorizontal: 15, justifyContent: 'center', borderRadius: 8 },
  createListButtonText: { color: '#fff', fontWeight: 'bold' },
  tabsWrapper: { height: 50, marginBottom: 10 },
  tabScroll: { flexDirection: 'row' },
  tab: { backgroundColor: '#1E1E1E', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginRight: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  activeTab: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
  tabText: { color: '#888', fontWeight: 'bold' },
  activeTabText: { color: '#fff' },
  membersInfoContainer: { marginBottom: 15, backgroundColor: '#1a1a1a', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  membersTitle: { color: '#fff', fontWeight: 'bold', marginBottom: 8, fontSize: 14 },
  membersListWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  memberTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 5, marginRight: 8, marginBottom: 5 },
  memberTagText: { color: '#ccc', fontSize: 13, marginRight: 5 },
  memberRemoveBtn: { backgroundColor: '#ff453a', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  memberRemoveText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  subTabsContainer: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#1E1E1E', borderRadius: 8, padding: 3 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  subTabActive: { backgroundColor: '#333' },
  subTabText: { color: '#888', fontWeight: 'bold' },
  subTabTextActive: { color: '#fff' },
  addMemberContainer: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#2a2a2a', padding: 10, borderRadius: 8 },
  addMemberInput: { flex: 1, color: '#fff', marginRight: 10 },
  addMemberButton: { backgroundColor: '#32ade6', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6, justifyContent: 'center' },
  addMemberButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  inputContainer: { flexDirection: 'row', marginBottom: 10 },
  input: { flex: 1, backgroundColor: '#1E1E1E', color: '#fff', borderWidth: 1, borderColor: '#333', padding: 12, borderRadius: 8, marginRight: 10 },
  addButton: { backgroundColor: '#0a84ff', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  itemCard: { backgroundColor: '#1E1E1E', padding: 15, borderRadius: 10, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#0a84ff' },
  itemCardCompleted: { borderLeftColor: '#30d158', opacity: 0.8 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemText: { fontSize: 18, color: '#fff', flex: 1 },
  completedText: { textDecorationLine: 'line-through', color: '#888' },
  deleteIcon: { padding: 5 },
  deleteIconText: { color: '#ff453a', fontSize: 16, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  priceInput: { flex: 1, backgroundColor: '#2C2C2C', color: '#fff', padding: 8, borderRadius: 6, marginRight: 10 },
  buyButton: { backgroundColor: '#30d158', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 6 },
  buyButtonText: { color: '#fff', fontWeight: 'bold' },
  buyerInfo: { color: '#30d158', fontWeight: 'bold', fontStyle: 'italic', marginTop: 5 },
  summaryContainer: { backgroundColor: '#1E1E1E', padding: 15, borderRadius: 10, borderTopWidth: 1, borderTopColor: '#333' },
  summaryTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  summaryText: { color: '#ccc', fontSize: 16, marginBottom: 5 },
  clearButton: { backgroundColor: '#ff453a', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  clearButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  deleteListButton: { backgroundColor: '#2C2C2C', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15, borderWidth: 1, borderColor: '#ff453a' },
  deleteListButtonText: { color: '#ff453a', fontSize: 16, fontWeight: 'bold' },
  chatContainer: { flex: 1, backgroundColor: '#121212' },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 15, marginBottom: 10 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#005c4b', borderBottomRightRadius: 2 },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#202c33', borderBottomLeftRadius: 2 },
  messageSender: { color: '#32ade6', fontSize: 12, fontWeight: 'bold', marginBottom: 3 },
  messageText: { color: '#fff', fontSize: 15 },
  chatInputContainer: { flexDirection: 'row', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#333', marginBottom: 10 },
  chatInput: { flex: 1, backgroundColor: '#1E1E1E', color: '#fff', borderWidth: 1, borderColor: '#333', padding: 12, borderRadius: 20, marginRight: 10, paddingHorizontal: 15 },
  chatSendButton: { backgroundColor: '#0a84ff', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 20 },
  chatSendButtonText: { color: '#fff', fontWeight: 'bold' },
});