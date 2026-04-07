import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, SafeAreaView, ActivityIndicator, Vibration } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// ✅ SERVER SETTINGS
const API_URL = "https://ppl-erp-system.onrender.com/api";
const LOW_STOCK_THRESHOLD = 50; 

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  
  // App States
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null); 
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Scanner & Action States
  const [scanned, setScanned] = useState(false);
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); 

  // Inventory Dashboard States
  const [showInventory, setShowInventory] = useState(false);
  const [inventoryList, setInventoryList] = useState([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState(''); 

  // Check for saved login on startup
  useEffect(() => {
    checkSavedLogin();
  }, []);

  const checkSavedLogin = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (e) {
      console.log("Failed to load user session");
    } finally {
      setTimeout(() => { setShowSplash(false); }, 1500);
    }
  };

  const handleLogin = async () => {
    if (!passwordInput || !usernameInput) return Alert.alert("Error", "Please enter credentials");
    
    try {
      const res = await axios.post(`${API_URL}/login`, {
        username: usernameInput.toLowerCase().trim(),
        password: passwordInput.trim()
      });
      if (res.data.success) {
        const userData = { username: res.data.username, role: res.data.role };
        setUser(userData);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setPasswordInput(''); 
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Cannot connect to server. Check your internet.";
      Alert.alert("Login Failed ❌", errorMsg);
    }
  };

  const handleLogout = async () => { 
    await AsyncStorage.removeItem('user'); 
    setUser(null); 
    setUsernameInput(''); 
    setShowInventory(false);
  };

  const fetchFullInventory = async () => {
    setShowInventory(true);
    setIsLoadingInventory(true);
    setInventorySearchQuery(''); 
    try {
      const res = await axios.get(`${API_URL}/products`);
      setInventoryList(res.data);
    } catch (err) {
      Alert.alert("Error", "Could not load inventory from server.");
      setShowInventory(false);
    } finally {
      setIsLoadingInventory(false);
    }
  };

  const handleSearch = async (searchCode) => {
    if (!searchCode) return Alert.alert("Error", "Please enter a code");
    
    Vibration.vibrate(100);

    setScanned(true); 
    try {
      const res = await axios.get(`${API_URL}/product/${searchCode.trim()}`);
      setProduct(res.data);
      setManualCode(''); 
    } catch (err) {
      Vibration.vibrate(500);
      Alert.alert("Not Found", `Code ${searchCode} is not in the system.`, [{ text: "OK", onPress: () => setScanned(false) }]);
    }
  };

  const handleStandardUpdate = async (type) => {
    if (isSubmitting) return; 
    if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) {
      return Alert.alert("Error", "Please enter a valid quantity.");
    }
    
    setIsSubmitting(true);
    
    try {
      const res = await axios.post(`${API_URL}/stock`, {
        barcode: product.barcode || product.productCode, 
        type: type, 
        quantity: parseInt(quantity),
        username: user.username 
      });
      
      Vibration.vibrate([0, 150, 100, 150]);

      Alert.alert(
        "Success! ✅", 
        `${type} of ${quantity} recorded.\nNew Stock: ${res.data.newStock || 'Updated'}`, 
        [{ text: "Scan Next", onPress: resetApp }]
      );

    } catch (err) { 
      Vibration.vibrate(500);
      const errorMsg = err.response?.data?.message || err.message || "Server Error. Check terminal.";
      Alert.alert("Update Failed ❌", errorMsg); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetApp = () => { 
    setScanned(false); 
    setProduct(null); 
    setQuantity(''); 
  };

  // --- RENDERING VIEWS ---

  if (!permission?.granted) {
    return (
      <View style={styles.centered}>
        <Text style={{marginBottom: 20}}>Camera permission required.</Text>
        <TouchableOpacity style={styles.btnGreen} onPress={requestPermission}><Text style={styles.btnText}>Enable Camera</Text></TouchableOpacity>
      </View>
    );
  }

  if (showSplash) {
    return (
      <View style={styles.splashContainer}>
        <Text style={styles.splashLogo}>PPL</Text>
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20, transform: [{ scale: 1.5 }] }} />
        <Text style={styles.splashText}>LOADING SECURE SESSION...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>PPL ERP App</Text>
          <Text style={styles.loginSubtitle}>Authorized Personnel Only</Text>
          <TextInput style={styles.loginInput} placeholder="Username" value={usernameInput} onChangeText={setUsernameInput} autoCapitalize="none" />
          <TextInput style={styles.loginInput} placeholder="Password" value={passwordInput} onChangeText={setPasswordInput} secureTextEntry={true} />
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}><Text style={styles.btnText}>Login Securely</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // View: Full Inventory Dashboard
  if (showInventory) {
    const filteredInventory = inventoryList.filter(item => 
      (item.productCode || '').toLowerCase().includes(inventorySearchQuery.toLowerCase())
    );

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Global Inventory</Text>
          <TouchableOpacity onPress={() => setShowInventory(false)} style={styles.logoutBtn}>
            <Text style={{color: 'white', fontWeight: 'bold'}}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <TextInput 
            style={[styles.searchInput, {flex: 1}]} 
            placeholder="Search by product code..." 
            value={inventorySearchQuery} 
            onChangeText={setInventorySearchQuery} 
            autoCapitalize="characters" 
          />
          {inventorySearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setInventorySearchQuery('')} style={{justifyContent: 'center', paddingHorizontal: 10}}>
              <Text style={{color: '#dc3545', fontWeight: 'bold', fontSize: 16}}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoadingInventory ? (
          <View style={styles.centered}><ActivityIndicator size="large" color="#007bff" /><Text style={{marginTop: 10}}>Fetching Database...</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{padding: 15}}>
            {filteredInventory.length === 0 ? (
              <Text style={{textAlign: 'center', marginTop: 20, color: '#666', fontSize: 16}}>No products found matching "{inventorySearchQuery}"</Text>
            ) : (
              filteredInventory.map((item, index) => {
                const isLowStock = parseInt(item.currentStock || 0) < LOW_STOCK_THRESHOLD;

                return (
                  <View key={index} style={[styles.inventoryCard, isLowStock && { borderColor: '#dc3545', borderWidth: 1 }]}>
                    <Text style={[styles.inventoryTitle, isLowStock && { color: '#dc3545', borderColor: '#dc3545' }]}>
                      {item.productCode || 'N/A'} {isLowStock && '⚠️'}
                    </Text>
                    <View style={styles.invRow}><Text style={styles.invLabel}>A/F:</Text><Text style={styles.invVal}>{item.af || '-'}</Text></View>
                    <View style={styles.invRow}><Text style={styles.invLabel}>Length:</Text><Text style={styles.invVal}>{item.length || '-'}</Text></View>
                    <View style={styles.invRow}><Text style={styles.invLabel}>Grade:</Text><Text style={styles.invVal}>{item.grade || '-'}</Text></View>
                    <View style={styles.invRow}><Text style={styles.invLabel}>Wt/Pc:</Text><Text style={styles.invVal}>{item.weightPerPc  || item.wt_pc || '-'}</Text></View>
                    <View style={styles.invRow}><Text style={styles.invLabel}>Sector:</Text><Text style={styles.invVal}>{item.sector || item.sectr || '-'}</Text></View>
                    
                    {/* NEW: Updated Production Rows */}
                    <View style={styles.invRow}><Text style={styles.invLabel}>Total Production Readied:</Text><Text style={[styles.invVal, {color: '#28a745'}]}>{item.productionReadied || item.fg || 0}</Text></View>
                    <View style={styles.invRow}><Text style={styles.invLabel}>Recent Readied Stock:</Text><Text style={[styles.invVal, {color: '#17a2b8'}]}>{item.recentReadied || item.recentFg || 0}</Text></View>
                    
                    <View style={[styles.invRow, {borderBottomWidth: 0}]}>
                      <Text style={[styles.invLabel, {color: '#333'}]}>Current Stock:</Text>
                      <Text style={[styles.invVal, {color: isLowStock ? '#dc3545' : '#007bff', fontSize: 16}]}>
                        {item.currentStock || 0} {isLowStock && ' (LOW)'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // View: Scanner Main View
  return (
    <SafeAreaView style={styles.container}>
      {!scanned ? (
        <View style={{flex: 1}}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerText}>Scanner Mode</Text>
              <Text style={{color: '#e0e0e0', fontSize: 12}}>User: {user.username}</Text>
            </View>
            
            <View style={{flexDirection: 'row'}}>
              <TouchableOpacity onPress={fetchFullInventory} style={[styles.logoutBtn, {marginRight: 10, backgroundColor: '#28a745'}]}>
                <Text style={{color: 'white', fontWeight: 'bold'}}>Inventory</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                <Text style={{color: 'white', fontWeight: 'bold'}}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.searchContainer}>
            <TextInput style={styles.searchInput} placeholder="Type product code..." value={manualCode} onChangeText={setManualCode} autoCapitalize="characters" />
            <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch(manualCode)}><Text style={styles.searchBtnText}>Search</Text></TouchableOpacity>
          </View>

          <View style={styles.cameraContainer}>
             <CameraView style={StyleSheet.absoluteFillObject} onBarcodeScanned={({data}) => handleSearch(data)} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.detailsBox}>
          {product && (() => {
            const isLowStock = parseInt(product.currentStock || 0) < LOW_STOCK_THRESHOLD;

            return (
              <View style={{width: '100%'}}>
                <Text style={styles.itemTitle}>{String(product.productCode || 'UNKNOWN CODE')}</Text>
                
                <View style={styles.card}>
                  <View style={styles.infoRow}><Text style={styles.label}>A/F:</Text><Text style={styles.val}>{product.af || 'N/A'}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.label}>Wt/Pc (kg):</Text><Text style={styles.val}>{product.weightPerPc  || product.wt_pc || 'N/A'}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.label}>Grade:</Text><Text style={styles.val}>{product.grade || 'N/A'}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.label}>Length:</Text><Text style={styles.val}>{product.length || 'N/A'}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.label}>Sector:</Text><Text style={styles.val}>{product.sector || product.sectr || 'N/A'}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.label}>Prod. Readied (FG):</Text><Text style={[styles.val, {color: '#28a745'}]}>{String(product.productionReadied || product.fg || 0)}</Text></View>
                  
                  <View style={[styles.infoRow, {borderBottomWidth: 0, marginTop: 5}]}>
                    <Text style={[styles.label, {fontSize: 16, color: '#333'}]}>Current Stock:</Text>
                    <Text style={[styles.val, {color: isLowStock ? '#dc3545' : '#007bff', fontSize: 20}]}>
                      {String(product.currentStock || 0)} {isLowStock && '⚠️ LOW'}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionBox}>
                  <Text style={styles.qtyLabel}>Enter Quantity:</Text>
                  <TextInput style={styles.inputBig} keyboardType="numeric" placeholder="0" value={quantity} onChangeText={setQuantity} editable={!isSubmitting} />

                  <View style={styles.btnRow}>
                    <TouchableOpacity style={[styles.btnGreen, isSubmitting && {opacity: 0.5}]} onPress={() => handleStandardUpdate('INWARD')} disabled={isSubmitting}>
                      <Text style={styles.btnText}>{isSubmitting ? "Processing..." : "+ INWARD"}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={[styles.btnRed, isSubmitting && {opacity: 0.5}]} onPress={() => handleStandardUpdate('DISPATCH')} disabled={isSubmitting}>
                      <Text style={styles.btnText}>{isSubmitting ? "Processing..." : "- DISPATCH"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={styles.cancelBtn} onPress={resetApp} disabled={isSubmitting}>
                  <Text style={styles.cancelText}>Cancel & Rescan</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  splashContainer: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  splashLogo: { fontSize: 80, fontWeight: '900', color: '#007bff', letterSpacing: 5 },
  splashText: { marginTop: 40, color: '#666', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  loginContainer: { flex: 1, backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center' },
  loginCard: { backgroundColor: 'white', padding: 30, borderRadius: 15, width: '85%', alignItems: 'center', elevation: 5 },
  loginTitle: { fontSize: 28, fontWeight: 'bold', color: '#007bff', marginBottom: 5 },
  loginSubtitle: { fontSize: 14, color: '#666', marginBottom: 25 },
  loginInput: { width: '100%', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
  loginBtn: { backgroundColor: '#007bff', width: '100%', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  header: { padding: 30, paddingTop: 50, backgroundColor: '#007bff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 5 },
  searchContainer: { flexDirection: 'row', padding: 15, backgroundColor: 'white', elevation: 2, zIndex: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9' },
  searchBtn: { backgroundColor: '#333', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8, marginLeft: 10 },
  searchBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cameraContainer: { flex: 1, margin: 20, borderRadius: 20, overflow: 'hidden', backgroundColor: 'black' },
  detailsBox: { padding: 20, alignItems: 'center' },
  itemTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
  card: { backgroundColor: 'white', width: '100%', padding: 20, borderRadius: 10, elevation: 3, marginBottom: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 10 },
  label: { color: '#666', fontWeight: 'bold', fontSize: 15 },
  val: { fontWeight: 'bold', color: '#222', fontSize: 15 },
  actionBox: { backgroundColor: '#fff', padding: 20, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', width: '100%', marginBottom: 15, alignItems: 'center' },
  qtyLabel: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#444' },
  inputBig: { borderBottomWidth: 3, borderColor: '#007bff', width: 150, fontSize: 40, textAlign: 'center', marginBottom: 25, color: '#333', paddingBottom: 5 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnGreen: { flex: 1, backgroundColor: '#28a745', padding: 18, borderRadius: 8, alignItems: 'center', marginHorizontal: 5, elevation: 2 },
  btnRed: { flex: 1, backgroundColor: '#dc3545', padding: 18, borderRadius: 8, alignItems: 'center', marginHorizontal: 5, elevation: 2 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  cancelBtn: { marginTop: 15, alignSelf: 'center', padding: 10 },
  cancelText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  
  inventoryCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
  inventoryTitle: { fontSize: 20, fontWeight: 'bold', color: '#007bff', marginBottom: 10, borderBottomWidth: 2, borderColor: '#007bff', paddingBottom: 5 },
  invRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  invLabel: { color: '#666', fontWeight: 'bold' },
  invVal: { color: '#333', fontWeight: 'bold' }
});