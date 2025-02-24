// استخدام Firebase من window.app
const auth = window.app.auth;
const db = window.app.db;
const storage = window.app.storage;

// إضافة الأنماط للمحادثات
const chatStyles = `
    .chat-messages {
        max-height: 400px;
        overflow-y: auto;
        padding: 1rem;
    }
    .message {
        max-width: 75%;
        margin-bottom: 1rem;
        clear: both;
    }
    .message.admin {
        float: left;
    }
    .message.user {
        float: right;
    }
    .message .content {
        padding: 0.75rem;
        border-radius: 1rem;
        word-wrap: break-word;
    }
    .message.user .content {
        background-color: #f8f9fa;
    }
    .message.admin .content {
        background-color: #0d6efd;
        color: white;
    }
    .message small {
        display: block;
        margin-top: 0.25rem;
        font-size: 0.75rem;
    }
    .chat-window {
        height: 400px;
        overflow-y: auto;
        background-color: #fff;
    }
    .chat-input {
        border-top: 1px solid #dee2e6;
        padding: 1rem;
        background-color: #fff;
    }
`;

// إضافة الأنماط إلى الصفحة
const styleElement = document.createElement('style');
styleElement.textContent = chatStyles;
document.head.appendChild(styleElement);

// التحقق من حالة تسجيل الدخول وإعداد مستمعي الأحداث
document.addEventListener('DOMContentLoaded', function() {
    console.log('تم تحميل الصفحة');
    
    // إظهار شاشة التحميل
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.remove('d-none');

    // مراقبة حالة تسجيل الدخول
    auth.onAuthStateChanged(async function(user) {
        try {
            if (!user) {
                console.log('المستخدم غير مسجل الدخول');
                // التحقق مما إذا كنا نقوم بإنشاء مستخدم جديد
                if (window.isAddingNewUser) {
                    console.log('جاري إنشاء مستخدم جديد، تجاهل تغيير حالة المصادقة');
                    return;
                }
                window.location.href = 'index.html';
                return;
            }

            // التحقق من صلاحيات المستخدم
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists || userDoc.data().role !== 'admin') {
                console.log('المستخدم ليس مشرفاً');
                if (window.isAddingNewUser) {
                    console.log('جاري إنشاء مستخدم جديد، تجاهل تغيير حالة المصادقة');
                    return;
                }
                await auth.signOut();
                window.location.href = 'index.html';
                return;
            }

            // تحديث اسم المستخدم
            const userDisplayName = document.getElementById('userDisplayName');
            if (userDisplayName) {
                userDisplayName.textContent = userDoc.data().name || 'المشرف';
            }

            // إضافة مستمع لزر تسجيل الخروج
            const logoutButton = document.getElementById('logoutButton');
            if (logoutButton) {
                logoutButton.addEventListener('click', logout);
            }

            // إضافة مستمعي الأحداث لروابط القائمة الجانبية
            const sidebarLinks = document.querySelectorAll('.sidebar .nav-link');
            sidebarLinks.forEach(link => {
                link.addEventListener('click', async function(event) {
                    event.preventDefault();
                    const section = this.getAttribute('data-section');
                    await loadSection(section);
                });
            });

            // تحميل لوحة التحكم افتراضياً
            await loadDashboard();
        } catch (error) {
            console.error('Error initializing admin panel:', error);
            showError('حدث خطأ في تهيئة لوحة التحكم');
        } finally {
            if (loadingScreen) loadingScreen.classList.add('d-none');
        }
    });

    // تحميل الصفحة الرئيسية افتراضياً
    loadSection('dashboard');

    // إضافة مستمعي الأحداث للروابط
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // إزالة الكلاس النشط من جميع الروابط
            navLinks.forEach(l => l.classList.remove('active'));
            // إضافة الكلاس النشط للرابط المحدد
            this.classList.add('active');

            // تحميل القسم المطلوب
            const section = this.getAttribute('data-section');
            loadSection(section);
        });
    });
});

// تحديث دالة initializeNotifications
async function initializeNotifications() {
    // إضافة أيقونة الدردشة للهاتف المحمول
    const mobileNav = document.querySelector('.navbar-nav');
    if (mobileNav && window.innerWidth <= 768) {
        const mobileChatItem = document.createElement('li');
        mobileChatItem.className = 'nav-item d-md-none';
        mobileChatItem.innerHTML = `
            <a class="nav-link" href="#" data-section="consultations">
                <i class="fas fa-comments"></i>
                <span class="badge bg-danger rounded-pill position-absolute top-0 start-100 translate-middle d-none" 
                      id="mobileChatBadge">0</span>
            </a>
        `;
        mobileNav.appendChild(mobileChatItem);

        // إضافة مستمع للنقر على أيقونة الدردشة
        mobileChatItem.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            loadSection('consultations');
        });
    }

    // إضافة الإشعار في القائمة الجانبية
    const sidebarLink = document.querySelector('.sidebar a[data-section="consultations"]');
    if (sidebarLink) {
        // إضافة شارة الإشعارات
        const sidebarBadge = document.createElement('span');
        sidebarBadge.className = 'badge bg-danger ms-2 d-none';
        sidebarBadge.id = 'sidebarMessagesBadge';
        sidebarBadge.style.fontSize = '0.7rem';
        sidebarLink.appendChild(sidebarBadge);

        // مراقبة الرسائل غير المقروءة
        db.collection('consultations')
            .where('isRead', '==', false)
            .onSnapshot(snapshot => {
                const unreadCount = snapshot.docs.length;
                
                if (unreadCount > 0) {
                    // تحديث شارة القائمة الجانبية
                    sidebarBadge.textContent = unreadCount;
                    sidebarBadge.classList.remove('d-none');

                    // تحديث شارة الهاتف المحمول
                    const mobileBadge = document.getElementById('mobileChatBadge');
                    if (mobileBadge) {
                        mobileBadge.textContent = unreadCount;
                        mobileBadge.classList.remove('d-none');
                    }
                    
                    // تشغيل صوت التنبيه
                    const notification = new Audio('/assets/notification.mp3');
                    notification.play().catch(e => console.log('Audio play failed:', e));
                    
                    // إظهار إشعار المتصفح
                    if (Notification.permission === 'granted') {
                        new Notification('رسالة جديدة', {
                            body: 'لديك ' + unreadCount + ' رسالة جديدة',
                            icon: '/assets/icon.png'
                        });
                    }
                } else {
                    // إخفاء جميع الشارات
                    sidebarBadge.classList.add('d-none');
                    const mobileBadge = document.getElementById('mobileChatBadge');
                    if (mobileBadge) {
                        mobileBadge.classList.add('d-none');
                    }
                }
            });
    }
}

// إضافة مستمع لتغيير حجم النافذة
window.addEventListener('resize', () => {
    const mobileChatItem = document.querySelector('.nav-item.d-md-none');
    const mobileNav = document.querySelector('.navbar-nav');
    
    if (window.innerWidth <= 768) {
        // إضافة أيقونة الدردشة للهاتف إذا لم تكن موجودة
        if (!mobileChatItem && mobileNav) {
            initializeNotifications();
                }
            } else {
        // إزالة أيقونة الدردشة من الهاتف
        if (mobileChatItem) {
            mobileChatItem.remove();
            }
}
});

// تحديث دالة initializeAdminPanel
async function initializeAdminPanel(userData) {
    try {
        // تحديث اسم المستخدم في الواجهة
        const userDisplayName = document.getElementById('userDisplayName');
        if (userDisplayName) {
            userDisplayName.textContent = userData.name || 'المشرف';
        }

        // طلب إذن الإشعارات
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            await Notification.requestPermission();
        }

        // تهيئة نظام الإشعارات
        await initializeNotifications();

        // تحميل لوحة التحكم افتراضياً
        await loadDashboard();
    } catch (error) {
        console.error('Error initializing admin panel:', error);
        showAlert('حدث خطأ في تهيئة لوحة التحكم', 'danger');
    }
}

// دالة تحميل الأقسام
async function loadSection(section) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        showLoadingScreen();

        // إزالة الكلاس النشط من جميع الروابط
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // إضافة الكلاس النشط للرابط الحالي
        const currentLink = document.querySelector(`.nav-link[data-section="${section}"]`);
        if (currentLink) {
            currentLink.classList.add('active');
        }

        // تحديد القسم المطلوب
        switch(section) {
            case 'dashboard':
                await loadDashboard();
                break;
            case 'posts':
                await loadPosts();
                break;
            case 'routines':
                await loadRoutines();
                break;
            case 'users':
                await loadUsers();
                break;
            case 'consultations':
                await loadConsultations();
                break;
            case 'notifications': // إضافة الحالة الجديدة
                await loadNotifications();
                break;
            case 'profile':
                await loadProfile();
                break;
            case 'settings':
                await loadSettings();
                break;
            default:
                await loadDashboard();
        }
        
        // تحديث عنوان URL
        window.location.hash = section;

    } catch (error) {
        console.error('Error loading section:', error);
        showAlert('حدث خطأ في تحميل المحتوى', 'danger');
    } finally {
        hideLoadingScreen();
    }
}

// دالة إظهار شاشة التحميل
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.remove('d-none');
        loadingScreen.style.display = 'flex';
    }
}

// دالة إخفاء شاشة التحميل
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('d-none');
    }
}

// عرض رسالة تنبيه
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);

    // إزالة التنبيه تلقائياً بعد 3 ثواني
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

// عرض رسالة خطأ
function showError(message) {
    showAlert(message, 'danger');
}

// تحديث دالة sendMessage
async function sendMessage(event) {
    event.preventDefault();
    
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    
    if (!content || !window.currentChatId) return;

    try {
        const chatRef = db.collection('consultations').doc(window.currentChatId);
        const chatDoc = await chatRef.get();
        const chat = chatDoc.data();
        
        // إنشاء الرسالة الجديدة باستخدام new Date() بدلاً من serverTimestamp
        const newMessage = {
            content,
            sender: 'admin',
            timestamp: new Date(),
            isRead: false
        };

        // تحديث مصفوفة الرسائل
        const messages = chat.messages || [];
        messages.push(newMessage);

        // تحديث الوثيقة مع استخدام serverTimestamp فقط للحقول الخارجية
        await chatRef.update({
            messages,
            lastMessage: content,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isRead: false
        });

        // تفريغ حقل الإدخال
        messageInput.value = '';

    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('حدث خطأ في إرسال الرسالة', 'danger');
    }
}

// تحديث دالة initializeChat
async function initializeChat(chatId) {
    try {
        const chatDoc = await db.collection('consultations').doc(chatId).get();
        if (!chatDoc.exists) {
            // إنشاء محادثة جديدة إذا لم تكن موجودة
            await db.collection('consultations').doc(chatId).set({
                messages: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                isRead: true,
                lastMessageTime: null,
                lastMessage: ''
            });
        }
    } catch (error) {
        console.error('Error initializing chat:', error);
        showAlert('حدث خطأ في تهيئة المحادثة', 'danger');
    }
}

// تحميل محادثة معينة
async function loadChat(chatId) {
    currentChatId = chatId;
    const chatMessages = document.getElementById('chatMessages');
    const chatActions = document.getElementById('chatActions');
    
    // إعادة تعيين مجموعة معرفات الرسائل
    messageIdsSet.clear();
    
    // إظهار أزرار التحكم بالمحادثة
    chatActions.style.display = 'block';
    
    // إلغاء الاشتراك السابق إذا وُجد
    if (chatUnsubscribe) {
        chatUnsubscribe();
    }

    try {
        // تحديث حالة القراءة
        await db.collection('consultations').doc(chatId).update({
            unreadCount: 0
        });

        // تحديث العنوان
        const chatDoc = await db.collection('consultations').doc(chatId).get();
        const chatData = chatDoc.data();
        document.getElementById('chatTitle').innerHTML = `
            <div class="d-flex align-items-center">
                <span class="user-status ${chatData.online ? 'online' : 'offline'}"></span>
                ${chatData.userName || 'مستخدم'}
            </div>`;

        // مسح الرسائل السابقة وإضافة رسالة الترحيب
        chatMessages.innerHTML = '';
        
        // جلب الرسائل وعرضها
        const messagesQuery = db.collection('consultations')
            .doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc');

        chatUnsubscribe = messagesQuery.onSnapshot(snapshot => {
            let lastDate = null;
            
            snapshot.docChanges().forEach(change => {
                const messageId = change.doc.id;
                
                // التحقق من أن الرسالة لم يتم عرضها من قبل
                if (!messageIdsSet.has(messageId)) {
                    messageIdsSet.add(messageId);
                    
                    const message = change.doc.data();
                    if (!message.timestamp) return; // تجاهل الرسائل بدون توقيت
                    
                    // تنسيق التاريخ بالميلادي باللغة الفرنسية
                    const messageDate = formatDate(message.timestamp);
                    const messageTime = formatTime(message.timestamp);
                    
                    // إضافة فاصل التاريخ إذا تغير اليوم
                    if (messageDate !== lastDate) {
                        const dateDiv = document.createElement('div');
                        dateDiv.className = 'chat-date-divider';
                        dateDiv.innerHTML = `<span>${messageDate}</span>`;
                        chatMessages.appendChild(dateDiv);
                        lastDate = messageDate;
                    }

                    // إنشاء عنصر الرسالة
                    const messageElement = document.createElement('div');
                    messageElement.className = `chat-message ${message.isAdmin ? 'admin' : 'user'}`;
                    messageElement.setAttribute('data-message-id', messageId);
                    messageElement.innerHTML = `
                        <div class="message-content">
                            <div class="message-header">
                                <span class="message-sender">${message.senderName}</span>
                                <span class="message-time">${messageTime}</span>
                            </div>
                            <div class="message-text">${message.content}</div>
                        </div>
                    `;
                    
                    chatMessages.appendChild(messageElement);
                }
            });

            // تمرير للأسفل بعد إضافة رسائل جديدة
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });

        // تحديث القائمة النشطة
        const chatItems = document.querySelectorAll('#chatList .list-group-item');
        chatItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('onclick').includes(chatId)) {
                item.classList.add('active');
            }
        });

    } catch (error) {
        console.error('Error loading chat:', error);
        showAlert('حدث خطأ في تحميل المحادثة', 'danger');
    }
}

// إضافة دالة تنظيف عند تغيير المحادثة
function cleanupChat() {
    if (window.currentChatUnsubscribe) {
        window.currentChatUnsubscribe();
        window.currentChatUnsubscribe = null;
    }
    if (window.consultationsUnsubscribe) {
        window.consultationsUnsubscribe();
        window.consultationsUnsubscribe = null;
    }
    window.currentChatId = null;
}

// دالة تحميل المحادثات
async function loadConsultations() {
    cleanupChat(); // تنظيف المحادثة السابقة
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        // تهيئة واجهة المحادثات
        mainContent.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2>المحادثات والاستشارات</h2>
                </div>
            </div>
            
            <div class="row">
                <!-- قائمة المحادثات -->
                <div class="col-md-4 mb-4">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="card-title mb-0">قائمة المحادثات</h5>
                            <div class="btn-group">
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteAllConsultations()">
                                    <i class="fas fa-trash-alt"></i> حذف الكل
                                </button>
                            </div>
                        </div>
                        <div class="list-group list-group-flush" id="chatList">
                            <!-- سيتم تعبئة قائمة المحادثات هنا -->
                        </div>
                    </div>
                </div>

                <!-- نافذة المحادثة -->
                <div class="col-md-8 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0" id="chatTitle">اختر محادثة للبدء</h5>
                        </div>
                        <div class="card-body p-0">
                            <div class="chat-window" id="chatWindow">
                                <div class="text-center text-muted py-5">
                                    <i class="fas fa-comments fa-3x mb-3"></i>
                                    <h5>اختر محادثة من القائمة</h5>
                                </div>
                            </div>
                        </div>
                        <div class="card-footer" id="chatInput" style="display: none;">
                            <form onsubmit="sendMessage(event)">
                                <div class="input-group">
                                    <input type="text" class="form-control" id="messageInput" 
                                           placeholder="اكتب رسالتك هنا...">
                                    <button class="btn btn-primary" type="submit">
                                        <i class="fas fa-paper-plane"></i>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // إضافة مراقب للمحادثات
        const unsubscribe = db.collection('consultations')
            .orderBy('lastMessageTime', 'desc')
            .onSnapshot(snapshot => {
                const chatList = document.getElementById('chatList');
                if (!chatList) return;

                chatList.innerHTML = snapshot.docs.map(doc => {
                    const chat = doc.data();
                    const lastMessage = chat.messages?.length > 0 ? 
                        chat.messages[chat.messages.length - 1] : null;
                    const unreadCount = chat.messages?.filter(m => !m.isRead && m.sender !== 'admin').length || 0;
                    
                    // تنسيق التاريخ والوقت بالميلادي باللغة الفرنسية
                    const lastMessageTime = chat.lastMessageTime;
                    const formattedDateTime = formatDateTime(lastMessageTime);

                    return `
                        <div class="list-group-item">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center chat-item ${!chat.isRead ? 'unread' : ''}"
                                     onclick="loadChat('${doc.id}')" style="flex-grow: 1;">
                                    <div class="user-avatar small-avatar me-3">
                                        <i class="fas fa-user"></i>
                                    </div>
                                    <div class="flex-grow-1">
                                        <h6 class="mb-0">${chat.userName || 'مستخدم'}</h6>
                                        <small class="text-muted d-block">
                                            ${formattedDateTime}
                                        </small>
                                        <small class="text-muted">
                                            ${lastMessage ? lastMessage.content.substring(0, 30) + '...' : 'لا توجد رسائل'}
                                        </small>
                                    </div>
                                    ${unreadCount > 0 ? `
                                        <span class="badge bg-danger rounded-pill ms-2">${unreadCount}</span>
                                    ` : ''}
                                </div>
                                <button class="btn btn-sm btn-outline-danger ms-2" 
                                        onclick="deleteConsultation('${doc.id}')">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('') || '<div class="text-center text-muted p-3">لا توجد محادثات</div>';
            });

        // تخزين دالة إلغاء المراقبة
        window.consultationsUnsubscribe = unsubscribe;

    } catch (error) {
        console.error('Error loading consultations:', error);
        showAlert('حدث خطأ في تحميل المحادثات', 'danger');
    }
}

// دالة جلب عدد الإعجابات
async function getLikesCount(postId) {
    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        const post = postDoc.data();
        return post.likes ? post.likes.length : 0;
    } catch (error) {
        console.error('Error getting likes count:', error);
        return 0;
    }
}

// دالة جلب عدد التعليقات
async function getCommentsCount(postId) {
    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        const post = postDoc.data();
        return post.comments ? Object.keys(post.comments).length : 0;
    } catch (error) {
        console.error('Error getting comments count:', error);
        return 0;
    }
}

// دالة إظهار نموذج إضافة منشور جديد
function showAddPostModal() {
    const modal = new bootstrap.Modal(document.getElementById('postModal'));
    document.getElementById('postForm').reset();
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('postModalTitle').textContent = 'إضافة منشور جديد';
    window.currentPostId = null;
    modal.show();
}

// دالة حفظ المنشور
async function savePost() {
    try {
        const title = document.getElementById('postTitle').value;
        const content = document.getElementById('postContent').value;
        const status = document.getElementById('postStatus').value;
        const imageFile = document.getElementById('postImage').files[0];

        if (!title || !content) {
            showAlert('يرجى ملء جميع الحقول المطلوبة', 'warning');
            return;
        }

        showLoadingScreen();

        let imageUrl = '';
        if (imageFile) {
            const imageRef = storage.ref(`posts/${Date.now()}_${imageFile.name}`);
            await imageRef.put(imageFile);
            imageUrl = await imageRef.getDownloadURL();
        }

        const postData = {
            title,
                        content,
            status,
            imageUrl,
            authorId: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'مشرف',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!window.currentPostId) {
            // إضافة منشور جديد
            postData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('posts').add(postData);
            showAlert('تم إضافة المنشور بنجاح', 'success');
        } else {
            // تحديث منشور موجود
            await db.collection('posts').doc(window.currentPostId).update(postData);
            showAlert('تم تحديث المنشور بنجاح', 'success');
        }

        // إغلاق النموذج
        const modal = bootstrap.Modal.getInstance(document.getElementById('postModal'));
        modal.hide();

    } catch (error) {
        console.error('Error saving post:', error);
        showAlert('حدث خطأ في حفظ المنشور', 'danger');
    } finally {
        hideLoadingScreen();
    }
}

// تحميل صفحة الروتين اليومي
async function loadRoutines() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        mainContent.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                        <h2 class="mb-0">إدارة الروتين اليومي</h2>
                        <button class="btn btn-primary" onclick="showAddRoutineModal()">
                            <i class="fas fa-plus-circle me-2"></i>إضافة روتين جديد
                        </button>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead class="table-light">
                                        <tr>
                                            <th style="width: 50px">#</th>
                                            <th style="width: 100px">الصورة</th>
                                            <th>العنوان</th>
                                            <th>الوقت</th>
                                            <th>التاريخ</th>
                                            <th style="width: 150px">الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody id="routinesTableBody">
                                        <!-- سيتم تعبئة الروتين هنا -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // جلب نصائح الروتين اليومي
        const routinesSnapshot = await db.collection('routines')
            .orderBy('createdAt', 'desc')
            .get();
        
        const routinesTableBody = document.getElementById('routinesTableBody');
        
        routinesTableBody.innerHTML = routinesSnapshot.docs.map((doc, index) => {
            const routine = doc.data();
            const createdAt = formatDateTime(routine.createdAt);

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        ${routine.imageUrl ? `
                            <img src="${routine.imageUrl}" class="rounded" 
                                 style="width: 60px; height: 60px; object-fit: cover;"
                                 alt="${routine.title}">
                        ` : `
                            <div class="rounded bg-light d-flex align-items-center justify-content-center"
                                 style="width: 60px; height: 60px;">
                                <i class="fas fa-image text-muted"></i>
                            </div>
                        `}
                    </td>
                    <td>
                        <h6 class="mb-1">${routine.title}</h6>
                        <small class="text-muted">${routine.description.substring(0, 50)}...</small>
                    </td>
                    <td>
                        <span class="badge bg-primary">${routine.time}</span>
                    </td>
                    <td>
                        <div>${createdAt}</div>
                    </td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-primary" onclick="editRoutine('${doc.id}')" title="تعديل">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-info" onclick="viewRoutine('${doc.id}')" title="عرض">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteRoutine('${doc.id}')" title="حذف">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading routines:', error);
        showAlert('حدث خطأ في تحميل الروتين اليومي', 'danger');
    }
}

// وظيفة إظهار نموذج إضافة تنبيه
function showAddNotificationModal() {
    const modal = new bootstrap.Modal(document.getElementById('addNotificationModal'));
    modal.show();
}

// وظيفة حذف تنبيه
async function deleteNotification(notificationId) {
    if (!confirm('هل أنت متأكد من حذف هذا التنبيه؟')) return;

    try {
        await db.collection('notifications').doc(notificationId).delete();
        showAlert('تم حذف التنبيه بنجاح', 'success');
        loadNotifications();
    } catch (error) {
        console.error('Error deleting notification:', error);
        showAlert('حدث خطأ في حذف التنبيه', 'danger');
    }
}

async function initializeMessageNotifications() {
    const chatIcon = document.querySelector('a[href="#consultations"]');
    if (chatIcon) {
        const badge = document.createElement('span');
        badge.className = 'position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none';
        badge.id = 'unreadMessagesBadge';
        badge.style.fontSize = '0.7rem';
        chatIcon.style.position = 'relative';
        chatIcon.appendChild(badge);

        // مراقبة الرسائل غير المقروءة
        db.collection('consultations')
            .where('isRead', '==', false)
            .onSnapshot(snapshot => {
                const unreadCount = snapshot.docs.length;
                
                if (unreadCount > 0) {
                    badge.textContent = unreadCount;
                    badge.classList.remove('d-none');
                    
                    // تشغيل صوت التنبيه
                    const notification = new Audio('/assets/notification.mp3');
                    notification.play().catch(e => console.log('Audio play failed:', e));
                    
                    // إظهار إشعار المتصفح
                    if (Notification.permission === 'granted') {
                        new Notification('رسالة جديدة', {
                            body: 'لديك ' + unreadCount + ' رسالة جديدة',
                            icon: '/assets/icon.png'
                        });
                    }
                } else {
                    badge.classList.add('d-none');
                }
            });
    }
}

// إضافة مستمع للتغييرات في عنوان URL
window.addEventListener('hashchange', function() {
    const section = window.location.hash.replace('#', '') || 'dashboard';
    loadSection(section);
});

// تحميل لوحة التحكم الرئيسية
async function loadDashboard() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        // جلب الإحصائيات
        const [users, posts, routines, consultations] = await Promise.all([
            db.collection('users').get(),
            db.collection('posts').get(),
            db.collection('routines').get(),
            db.collection('consultations').get()
        ]);

        mainContent.innerHTML = `
            <!-- الإحصائيات -->
            <div class="row mb-4">
                <div class="col-md-3 mb-3">
                    <div class="card bg-primary text-white h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="card-title mb-1">المستخدمين</h6>
                                    <h2 class="mb-0">${users.size}</h2>
                                </div>
                                <div class="fs-1 opacity-50">
                                    <i class="fas fa-users"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-success text-white h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="card-title mb-1">المنشورات</h6>
                                    <h2 class="mb-0">${posts.size}</h2>
                                </div>
                                <div class="fs-1 opacity-50">
                                    <i class="fas fa-newspaper"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-info text-white h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="card-title mb-1">الروتين اليومي</h6>
                                    <h2 class="mb-0">${routines.size}</h2>
                                </div>
                                <div class="fs-1 opacity-50">
                                    <i class="fas fa-calendar-check"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-warning text-white h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="card-title mb-1">الاستشارات</h6>
                                    <h2 class="mb-0">${consultations.size}</h2>
                                </div>
                                <div class="fs-1 opacity-50">
                                    <i class="fas fa-comments"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- آخر النشاطات -->
            <div class="row">
                <div class="col-md-6 mb-4">
                    <div class="card h-100">
                        <div class="card-header">
                            <h5 class="card-title mb-0">آخر المنشورات</h5>
                        </div>
                        <div class="card-body">
                            ${await getLatestPosts()}
                        </div>
                    </div>
                </div>
                <div class="col-md-6 mb-4">
                    <div class="card h-100">
                        <div class="card-header">
                            <h5 class="card-title mb-0">آخر الاستشارات</h5>
                        </div>
                        <div class="card-body">
                            ${await getLatestConsultations()}
                        </div>
                    </div>
                </div>
            </div>
        `;

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showAlert('حدث خطأ في تحميل لوحة التحكم', 'danger');
    }
}

// دالة إرسال الإشعار
async function sendNotification(event) {
    event.preventDefault();
    
    const title = document.getElementById('notificationTitle').value;
    const content = document.getElementById('notificationContent').value;
    const type = document.getElementById('notificationType').value;
    const selectedUsers = Array.from(document.getElementById('selectedUsers').selectedOptions).map(option => option.value);

    try {
        showLoadingScreen();

        const notification = {
            title,
            content,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            read: false
        };

        if (type === 'all') {
            // إرسال لجميع المستخدمين
            const usersSnapshot = await db.collection('users').get();
            const batch = db.batch();

            usersSnapshot.docs.forEach(doc => {
                const notificationRef = db.collection('users').doc(doc.id)
                    .collection('notifications').doc();
                batch.set(notificationRef, notification);
            });

            await batch.commit();
        } else {
            // إرسال للمستخدمين المحددين
            const batch = db.batch();

            selectedUsers.forEach(userId => {
                const notificationRef = db.collection('users').doc(userId)
                    .collection('notifications').doc();
                batch.set(notificationRef, notification);
            });

            await batch.commit();
        }

        hideLoadingScreen();
        showAlert('تم إرسال الإشعار بنجاح', 'success');
        document.getElementById('notificationForm').reset();

    } catch (error) {
        console.error('Error sending notification:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في إرسال الإشعار', 'danger');
    }
}

// إضافة الدالة إلى النافذة
window.sendNotification = sendNotification;

// دالة تنسيق التاريخ بالميلادي باللغة الفرنسية
function formatDate(timestamp) {
    if (!timestamp || !timestamp.seconds) return 'غير متوفر';
    
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    };
    
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('fr-FR', options);
}

// دالة تنسيق الوقت بنظام 24 ساعة
function formatTime(timestamp) {
    if (!timestamp || !timestamp.seconds) return '';
    
    const options = { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false // استخدام نظام 24 ساعة
    };
    
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleTimeString('fr-FR', options);
}

// دالة تنسيق التاريخ والوقت معاً
function formatDateTime(timestamp) {
    if (!timestamp || !timestamp.seconds) return 'غير متوفر';
    
    const date = new Date(timestamp.seconds * 1000);
    const dateOptions = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    };
    
    const timeOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };

    return `${date.toLocaleDateString('fr-FR', dateOptions)} - ${date.toLocaleTimeString('fr-FR', timeOptions)}`;
}

// دالة جلب آخر المنشورات
async function getLatestPosts() {
    try {
        const postsSnapshot = await db.collection('posts')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (postsSnapshot.empty) {
            return '<div class="text-center text-muted">لا توجد منشورات</div>';
        }

        return postsSnapshot.docs.map(doc => {
            const post = doc.data();
            // حساب التفاعلات مباشرة من بيانات المنشور
            const likesCount = post.likes ? post.likes.length : 0;
            const commentsCount = post.comments ? Object.keys(post.comments).length : 0;
            
            const createdAt = formatDateTime(post.createdAt);

            return `
                <div class="d-flex align-items-center mb-3 p-2 border-bottom">
                    <div class="me-3">
                        <div class="user-avatar small-avatar ${post.authorRole === 'admin' ? 'admin-avatar' : ''}">
                            <i class="fas fa-user"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <h6 class="mb-0">${post.title}</h6>
                        <small class="text-muted">${post.authorName} - ${createdAt}</small>
                    </div>
                    <div class="d-flex align-items-center">
                        <span class="badge bg-primary me-2" title="الإعجابات">
                            <i class="fas fa-heart"></i> ${likesCount}
                        </span>
                        <span class="badge bg-info" title="التعليقات">
                            <i class="fas fa-comments"></i> ${commentsCount}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error getting latest posts:', error);
        return '<div class="text-center text-danger">حدث خطأ في جلب المنشورات</div>';
    }
}

// دالة جلب آخر الاستشارات
async function getLatestConsultations() {
    try {
        const consultationsSnapshot = await db.collection('consultations')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (consultationsSnapshot.empty) {
            return '<div class="text-center text-muted">لا توجد استشارات</div>';
        }

        return consultationsSnapshot.docs.map(doc => {
            const consultation = doc.data();
            const createdAt = formatDateTime(consultation.createdAt);
            return `
                <div class="d-flex align-items-center mb-3 p-2 border-bottom">
                    <div class="me-3">
                        <div class="user-avatar small-avatar">
                            <i class="fas fa-user"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <h6 class="mb-0">${consultation.title || 'استشارة جديدة'}</h6>
                        <small class="text-muted">${consultation.userName} - ${createdAt}</small>
                    </div>
                    <span class="badge bg-${consultation.status === 'pending' ? 'warning' : 'success'}">
                        ${consultation.status === 'pending' ? 'قيد الانتظار' : 'تم الرد'}
                    </span>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error getting latest consultations:', error);
        return '<div class="text-center text-danger">حدث خطأ في جلب الاستشارات</div>';
    }
}

// دالة عرض المنشور
async function viewPost(postId) {
    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        const post = postDoc.data();
        
        // إنشاء مودال عرض المنشور
        const modalHtml = `
            <div class="modal fade" id="viewPostModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">عرض المنشور</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            ${post.imageUrl ? `
                                <img src="${post.imageUrl}" class="img-fluid rounded mb-3" alt="${post.title}">
                            ` : ''}
                            <h4>${post.title}</h4>
                            <div class="text-muted mb-3">
                                <small>
                                    <i class="fas fa-user"></i> ${post.authorName} | 
                                    <i class="fas fa-clock"></i> ${formatDate(post.createdAt)}
                                </small>
                            </div>
                            <p>${post.content}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إغلاق</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // إضافة المودال للصفحة
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // عرض المودال
        const modal = new bootstrap.Modal(document.getElementById('viewPostModal'));
        modal.show();
        
        // حذف المودال عند إغلاقه
        document.getElementById('viewPostModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    } catch (error) {
        console.error('Error viewing post:', error);
        showAlert('حدث خطأ في عرض المنشور', 'danger');
    }
}

// دالة تعديل المنشور
async function editPost(postId) {
    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        const post = postDoc.data();
        
        // إنشاء مودال تعديل المنشور
        const modalHtml = `
            <div class="modal fade" id="editPostModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">تعديل المنشور</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editPostForm">
                                <div class="mb-3">
                                    <label class="form-label">عنوان المنشور</label>
                                    <input type="text" class="form-control" id="editPostTitle" value="${post.title}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">محتوى المنشور</label>
                                    <textarea class="form-control" id="editPostContent" rows="4" required>${post.content}</textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">الصورة الحالية</label>
                                    ${post.imageUrl ? `
                                        <div class="mb-2">
                                            <img src="${post.imageUrl}" class="img-fluid rounded" style="max-height: 200px">
                                        </div>
                                    ` : ''}
                                    <input type="file" class="form-control" id="editPostImage" accept="image/*">
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                            <button type="button" class="btn btn-primary" onclick="updatePost('${postId}')">حفظ التغييرات</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // إضافة المودال للصفحة
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // عرض المودال
        const modal = new bootstrap.Modal(document.getElementById('editPostModal'));
        modal.show();
        
        // حذف المودال عند إغلاقه
        document.getElementById('editPostModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    } catch (error) {
        console.error('Error editing post:', error);
        showAlert('حدث خطأ في تحميل المنشور للتعديل', 'danger');
    }
}

// دالة تحديث المنشور
async function updatePost(postId) {
    try {
        const title = document.getElementById('editPostTitle').value;
        const content = document.getElementById('editPostContent').value;
        const imageFile = document.getElementById('editPostImage').files[0];
        
        if (!title || !content) {
            showAlert('يرجى ملء جميع الحقول المطلوبة', 'warning');
            return;
        }
        
        showLoadingScreen();
        
        let imageUrl = null;
        if (imageFile) {
            // رفع الصورة الجديدة
            const imageInfo = await window.app.uploadImage(imageFile);
            imageUrl = imageInfo.url;
        }
        
        // تحديث المنشور
        const updateData = {
            title,
            content,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (imageUrl) {
            updateData.imageUrl = imageUrl;
        }
        
        await db.collection('posts').doc(postId).update(updateData);
        
        hideLoadingScreen();
        const modal = bootstrap.Modal.getInstance(document.getElementById('editPostModal'));
        modal.hide();
        showAlert('تم تحديث المنشور بنجاح', 'success');
        
    } catch (error) {
        console.error('Error updating post:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في تحديث المنشور', 'danger');
    }
}

// دالة حذف المنشور
async function deletePost(postId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) {
        return;
    }
    
    try {
        showLoadingScreen();
        await db.collection('posts').doc(postId).delete();
        hideLoadingScreen();
        showAlert('تم حذف المنشور بنجاح', 'success');
    } catch (error) {
        console.error('Error deleting post:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في حذف المنشور', 'danger');
    }
}

// إضافة الدوال إلى النافذة
window.viewPost = viewPost;
window.editPost = editPost;
window.updatePost = updatePost;
window.deletePost = deletePost;

// تحديث دالة loadProfile
async function loadProfile() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
        const userData = userDoc.data();

        mainContent.innerHTML = `
            <div class="row">
                <div class="col-md-4 mb-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="position-relative d-inline-block mb-3">
                                <div class="profile-image-container" style="width: 150px; height: 150px; margin: 0 auto;">
                                    ${userData.photoURL ? `
                                        <img src="${userData.photoURL}" class="rounded-circle img-fluid" 
                                             style="width: 150px; height: 150px; object-fit: cover;">
                                    ` : `
                                        <div class="rounded-circle bg-light d-flex align-items-center justify-content-center"
                                             style="width: 150px; height: 150px;">
                                            <i class="fas fa-user fa-4x text-muted"></i>
                                        </div>
                                    `}
                                </div>
                                <button class="btn btn-sm btn-primary position-absolute bottom-0 end-0" 
                                        onclick="document.getElementById('profileImageInput').click()">
                                    <i class="fas fa-camera"></i>
                                </button>
                                <input type="file" id="profileImageInput" hidden accept="image/*" 
                                       onchange="updateProfileImage(event)">
                            </div>
                            <h5 class="mb-1">${userData.name}</h5>
                            <p class="text-muted">${userData.email}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">تعديل الملف الشخصي</h5>
                        </div>
                        <div class="card-body">
                            <form id="profileForm">
                                <div class="mb-3">
                                    <label class="form-label">الاسم</label>
                                    <input type="text" class="form-control" id="profileName" 
                                           value="${userData.name || ''}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">البريد الإلكتروني</label>
                                    <input type="email" class="form-control" value="${userData.email}" readonly>
                                </div>
                                <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // إضافة مستمع لنموذج تحديث الملف الشخصي
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateProfile();
        });

    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('حدث خطأ في تحميل الملف الشخصي', 'danger');
    }
}

// دالة تحديث الصورة الشخصية
async function updateProfileImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        showLoadingScreen();
        
        // رفع الصورة
        const imageInfo = await window.app.uploadImage(file);
        
        // تحديث صورة المستخدم في Firebase Auth
        await auth.currentUser.updateProfile({
            photoURL: imageInfo.url
        });
        
        // تحديث صورة المستخدم في Firestore
        await db.collection('users').doc(auth.currentUser.uid).update({
            photoURL: imageInfo.url
        });

        hideLoadingScreen();
        showAlert('تم تحديث الصورة الشخصية بنجاح', 'success');
        
        // إعادة تحميل الصفحة لعرض الصورة الجديدة
        loadProfile();
    } catch (error) {
        console.error('Error updating profile image:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في تحديث الصورة الشخصية', 'danger');
    }
}

// دالة تحديث الملف الشخصي
async function updateProfile() {
    const name = document.getElementById('profileName').value;

    try {
        showLoadingScreen();
        
        // تحديث اسم المستخدم في Firebase Auth
        await auth.currentUser.updateProfile({
            displayName: name
        });
        
        // تحديث معلومات المستخدم في Firestore
        await db.collection('users').doc(auth.currentUser.uid).update({
            name: name
        });

        hideLoadingScreen();
        showAlert('تم تحديث الملف الشخصي بنجاح', 'success');
    } catch (error) {
        console.error('Error updating profile:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في تحديث الملف الشخصي', 'danger');
    }
}

// تحديث دالة loadSettings
async function loadSettings() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-header">
                        <h5 class="card-title mb-0">تغيير كلمة المرور</h5>
                    </div>
                    <div class="card-body">
                        <form id="changePasswordForm">
                            <div class="mb-3">
                                <label class="form-label">كلمة المرور الحالية</label>
                                <input type="password" class="form-control" id="currentPassword" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">كلمة المرور الجديدة</label>
                                <input type="password" class="form-control" id="newPassword" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">تأكيد كلمة المرور الجديدة</label>
                                <input type="password" class="form-control" id="confirmPassword" required>
                            </div>
                            <button type="submit" class="btn btn-primary">تغيير كلمة المرور</button>
                        </form>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-header">
                        <h5 class="card-title mb-0">إعدادات الإشعارات</h5>
                    </div>
                    <div class="card-body">
                        <form id="notificationSettingsForm">
                            <div class="mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="emailNotifications">
                                    <label class="form-check-label">إشعارات البريد الإلكتروني</label>
                                </div>
                            </div>
                            <div class="mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="pushNotifications">
                                    <label class="form-check-label">الإشعارات المباشرة</label>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary">حفظ الإعدادات</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    // إضافة مستمع لنموذج تغيير كلمة المرور
    document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await changePassword();
    });

    // إضافة مستمع لنموذج إعدادات الإشعارات
    document.getElementById('notificationSettingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateNotificationSettings();
    });

    // تحميل إعدادات الإشعارات الحالية
    loadNotificationSettings();
}

// دالة تغيير كلمة المرور
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showAlert('كلمتا المرور غير متطابقتين', 'warning');
        return;
    }

    try {
        showLoadingScreen();
        
        // إعادة المصادقة قبل تغيير كلمة المرور
        const credential = firebase.auth.EmailAuthProvider.credential(
            auth.currentUser.email,
            currentPassword
        );
        await auth.currentUser.reauthenticateWithCredential(credential);
        
        // تغيير كلمة المرور
        await auth.currentUser.updatePassword(newPassword);

        hideLoadingScreen();
        showAlert('تم تغيير كلمة المرور بنجاح', 'success');
        
        // إعادة تعيين النموذج
        document.getElementById('changePasswordForm').reset();
    } catch (error) {
        console.error('Error changing password:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في تغيير كلمة المرور', 'danger');
    }
}

// دالة تحميل إعدادات الإشعارات
async function loadNotificationSettings() {
    try {
        const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
        const userData = userDoc.data();
        
        document.getElementById('emailNotifications').checked = userData.emailNotifications || false;
        document.getElementById('pushNotifications').checked = userData.pushNotifications || false;
    } catch (error) {
        console.error('Error loading notification settings:', error);
        showAlert('حدث خطأ في تحميل إعدادات الإشعارات', 'danger');
    }
}

// دالة تحديث إعدادات الإشعارات
async function updateNotificationSettings() {
    const emailNotifications = document.getElementById('emailNotifications').checked;
    const pushNotifications = document.getElementById('pushNotifications').checked;

    try {
        showLoadingScreen();
        
        await db.collection('users').doc(auth.currentUser.uid).update({
            emailNotifications,
            pushNotifications
        });

        hideLoadingScreen();
        showAlert('تم تحديث إعدادات الإشعارات بنجاح', 'success');
    } catch (error) {
        console.error('Error updating notification settings:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في تحديث إعدادات الإشعارات', 'danger');
    }
}

// إضافة الدوال إلى النافذة
window.updateProfileImage = updateProfileImage;
window.updateProfile = updateProfile;
window.changePassword = changePassword;
window.updateNotificationSettings = updateNotificationSettings;

// دالة تحميل الإشعارات في لوحة التحكم
async function loadNotificationsManagement() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        mainContent.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                        <h2 class="mb-0">إدارة الإشعارات</h2>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead class="table-light">
                                        <tr>
                                            <th>#</th>
                                            <th>العنوان</th>
                                            <th>المحتوى</th>
                                            <th>تاريخ الإرسال</th>
                                            <th>نوع الإشعار</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody id="notificationsTableBody">
                                        <!-- سيتم تعبئة الإشعارات هنا -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // جلب الإشعارات
        const notificationsSnapshot = await db.collection('notifications')
            .orderBy('createdAt', 'desc')
            .get();

        const notificationsTableBody = document.getElementById('notificationsTableBody');
        
        notificationsTableBody.innerHTML = notificationsSnapshot.docs.map((doc, index) => {
            const notification = doc.data();
            const createdAt = formatDateTime(notification.createdAt);

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${notification.title}</td>
                    <td>${notification.content}</td>
                    <td>${createdAt}</td>
                    <td>
                        <span class="badge bg-${notification.type === 'all' ? 'primary' : 'info'}">
                            ${notification.type === 'all' ? 'جميع المستخدمين' : 'مستخدمين محددين'}
                        </span>
                    </td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteNotification('${doc.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading notifications:', error);
        showAlert('حدث خطأ في تحميل الإشعارات', 'danger');
    }
}

// دالة حذف الإشعار
async function deleteNotification(notificationId) {
    if (!confirm('هل أنت متأكد من حذف هذا الإشعار؟')) {
        return;
    }

    try {
        showLoadingScreen();
        await db.collection('notifications').doc(notificationId).delete();
        hideLoadingScreen();
        showAlert('تم حذف الإشعار بنجاح', 'success');
        loadNotificationsManagement();
    } catch (error) {
        console.error('Error deleting notification:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في حذف الإشعار', 'danger');
    }
}

// دالة عرض الروتين
async function viewRoutine(routineId) {
    try {
        const routineDoc = await db.collection('routines').doc(routineId).get();
        const routine = routineDoc.data();
        
        // إنشاء مودال عرض الروتين
        const modalHtml = `
            <div class="modal fade" id="viewRoutineModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">عرض نصيحة الروتين</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            ${routine.imageUrl ? `
                                <img src="${routine.imageUrl}" class="img-fluid rounded mb-3" alt="${routine.title}">
                            ` : ''}
                            <h4>${routine.title}</h4>
                            <div class="text-muted mb-3">
                                <span class="badge bg-primary">${routine.time}</span>
                                <small class="ms-2">
                                    <i class="fas fa-clock"></i> ${formatDateTime(routine.createdAt)}
                                </small>
                            </div>
                            <p>${routine.description}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إغلاق</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('viewRoutineModal'));
        modal.show();
        
        document.getElementById('viewRoutineModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    } catch (error) {
        console.error('Error viewing routine:', error);
        showAlert('حدث خطأ في عرض الروتين', 'danger');
    }
}

// دالة تعديل الروتين
async function editRoutine(routineId) {
    try {
        const routineDoc = await db.collection('routines').doc(routineId).get();
        const routine = routineDoc.data();
        
        const modalHtml = `
            <div class="modal fade" id="editRoutineModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">تعديل نصيحة الروتين</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editRoutineForm">
                                <div class="mb-3">
                                    <label class="form-label">العنوان</label>
                                    <input type="text" class="form-control" id="editRoutineTitle" value="${routine.title}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">الوقت</label>
                                    <input type="text" class="form-control" id="editRoutineTime" value="${routine.time}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">الوصف</label>
                                    <textarea class="form-control" id="editRoutineDescription" rows="4" required>${routine.description}</textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">الصورة الحالية</label>
                                    ${routine.imageUrl ? `
                                        <div class="mb-2">
                                            <img src="${routine.imageUrl}" class="img-fluid rounded" style="max-height: 200px">
                                        </div>
                                    ` : ''}
                                    <input type="file" class="form-control" id="editRoutineImage" accept="image/*">
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                            <button type="button" class="btn btn-primary" onclick="updateRoutine('${routineId}')">حفظ التغييرات</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('editRoutineModal'));
        modal.show();
        
        document.getElementById('editRoutineModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    } catch (error) {
        console.error('Error editing routine:', error);
        showAlert('حدث خطأ في تحميل الروتين للتعديل', 'danger');
    }
}

// دالة تحديث الروتين
async function updateRoutine(routineId) {
    try {
        const title = document.getElementById('editRoutineTitle').value;
        const time = document.getElementById('editRoutineTime').value;
        const description = document.getElementById('editRoutineDescription').value;
        const imageFile = document.getElementById('editRoutineImage').files[0];
        
        if (!title || !time || !description) {
            showAlert('يرجى ملء جميع الحقول المطلوبة', 'warning');
            return;
        }
        
        showLoadingScreen();
        
        let imageUrl = null;
        if (imageFile) {
            const imageInfo = await window.app.uploadImage(imageFile);
            imageUrl = imageInfo.url;
        }
        
        const updateData = {
            title,
            time,
            description,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (imageUrl) {
            updateData.imageUrl = imageUrl;
        }
        
        await db.collection('routines').doc(routineId).update(updateData);
        
        hideLoadingScreen();
        const modal = bootstrap.Modal.getInstance(document.getElementById('editRoutineModal'));
        modal.hide();
        showAlert('تم تحديث الروتين بنجاح', 'success');
        
        // إعادة تحميل قائمة الروتين
        loadRoutines();
        
    } catch (error) {
        console.error('Error updating routine:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في تحديث الروتين', 'danger');
    }
}

// دالة حذف الروتين
async function deleteRoutine(routineId) {
    if (!confirm('هل أنت متأكد من حذف هذا الروتين؟')) {
        return;
    }
    
    try {
        showLoadingScreen();
        await db.collection('routines').doc(routineId).delete();
        hideLoadingScreen();
        showAlert('تم حذف الروتين بنجاح', 'success');
        loadRoutines(); // إعادة تحميل قائمة الروتين
    } catch (error) {
        console.error('Error deleting routine:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في حذف الروتين', 'danger');
    }
}

// إضافة الدوال إلى النافذة
window.viewRoutine = viewRoutine;
window.editRoutine = editRoutine;
window.updateRoutine = updateRoutine;
window.deleteRoutine = deleteRoutine;

// دالة إضافة منشور جديد
async function addNewPost(event) {
    event.preventDefault();
    
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('postContent').value;
    const imageFile = document.getElementById('postImage').files[0];

    if (!title || !content) {
        showAlert('يرجى ملء جميع الحقول المطلوبة', 'warning');
        return;
    }

    try {
        showLoadingScreen();
        
        let imageUrl = null;
        if (imageFile) {
            const imageInfo = await window.app.uploadImage(imageFile);
            imageUrl = imageInfo.url;
        }

        const user = auth.currentUser;
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        const postData = {
            title,
            content,
            imageUrl,
            authorId: user.uid,
            authorName: userDoc.data().name || 'مشرف',
            authorRole: 'admin',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            likes: [],
            comments: {}
        };

        await db.collection('posts').add(postData);
        
        hideLoadingScreen();
        const modal = bootstrap.Modal.getInstance(document.getElementById('postModal'));
        modal.hide();
        showAlert('تم إضافة المنشور بنجاح', 'success');
        
        // إعادة تحميل المنشورات
        loadPosts();

    } catch (error) {
        console.error('Error adding post:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في إضافة المنشور', 'danger');
    }
}

// دالة إضافة روتين جديد
async function addNewRoutine(event) {
    event.preventDefault();
    
    const title = document.getElementById('routineTitle').value;
    const time = document.getElementById('routineTime').value;
    const description = document.getElementById('routineDescription').value;
    const imageFile = document.getElementById('routineImage').files[0];

    // التحقق فقط من العنوان والوصف
    if (!title || !description) {
        showAlert('يرجى إدخال العنوان والوصف', 'warning');
        return;
    }

    try {
        showLoadingScreen();
        
        let imageUrl = null;
        if (imageFile) {
            const imageInfo = await window.app.uploadImage(imageFile);
            imageUrl = imageInfo.url;
        }

        const routineData = {
            title,
            time: time || '', // إذا كان الوقت فارغاً، نضع قيمة فارغة
            description,
            imageUrl,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('routines').add(routineData);
        
        hideLoadingScreen();
        const modal = bootstrap.Modal.getInstance(document.getElementById('routineModal'));
        modal.hide();
        showAlert('تم إضافة الروتين بنجاح', 'success');
        
        // إعادة تحميل الروتين
        loadRoutines();

    } catch (error) {
        console.error('Error adding routine:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في إضافة الروتين', 'danger');
    }
}

// دالة عرض مودال إضافة منشور جديد
function showAddPostModal() {
    const modalHtml = `
        <div class="modal fade" id="postModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">إضافة منشور جديد</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="postForm" onsubmit="addNewPost(event)">
                            <div class="mb-3">
                                <label class="form-label">عنوان المنشور</label>
                                <input type="text" class="form-control" id="postTitle" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">محتوى المنشور</label>
                                <textarea class="form-control" id="postContent" rows="4" required></textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">صورة المنشور</label>
                                <input type="file" class="form-control" id="postImage" accept="image/*">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                                <button type="submit" class="btn btn-primary">نشر</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('postModal'));
    modal.show();
    
    document.getElementById('postModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// دالة عرض مودال إضافة روتين جديد
function showAddRoutineModal() {
    const modalHtml = `
        <div class="modal fade" id="routineModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">إضافة روتين جديد</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="routineForm" onsubmit="addNewRoutine(event)">
                            <div class="mb-3">
                                <label class="form-label">عنوان الروتين <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" id="routineTitle" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الوقت</label>
                                <input type="text" class="form-control" id="routineTime" 
                                       placeholder="مثال: صباحاً، مساءً، قبل النوم">
                                <small class="text-muted">اختياري: يمكنك ترك هذا الحقل فارغاً</small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الوصف <span class="text-danger">*</span></label>
                                <textarea class="form-control" id="routineDescription" rows="4" required></textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">صورة الروتين</label>
                                <input type="file" class="form-control" id="routineImage" accept="image/*">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                                <button type="submit" class="btn btn-primary">إضافة</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('routineModal'));
    modal.show();
    
    document.getElementById('routineModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// إضافة الدوال إلى النافذة
window.addNewPost = addNewPost;
window.addNewRoutine = addNewRoutine;
window.showAddPostModal = showAddPostModal;
window.showAddRoutineModal = showAddRoutineModal;

// تحميل صفحة المنشورات
async function loadPosts() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        mainContent.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                        <h2 class="mb-0">إدارة المنشورات</h2>
                        <button class="btn btn-primary" onclick="showAddPostModal()">
                            <i class="fas fa-plus-circle me-2"></i>إضافة منشور جديد
                        </button>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead class="table-light">
                                        <tr>
                                            <th style="width: 50px">#</th>
                                            <th style="width: 100px">الصورة</th>
                                            <th>العنوان</th>
                                            <th>الكاتب</th>
                                            <th>التاريخ</th>
                                            <th style="width: 150px">الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody id="postsTableBody">
                                        <!-- سيتم تعبئة المنشورات هنا -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // جلب المنشورات
        const postsSnapshot = await db.collection('posts')
            .orderBy('createdAt', 'desc')
            .get();
        
        const postsTableBody = document.getElementById('postsTableBody');
        
        postsTableBody.innerHTML = postsSnapshot.docs.map((doc, index) => {
            const post = doc.data();
            const createdAt = formatDateTime(post.createdAt);

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        ${post.imageUrl ? `
                            <img src="${post.imageUrl}" class="rounded" 
                                 style="width: 60px; height: 60px; object-fit: cover;"
                                 alt="${post.title}">
                        ` : `
                            <div class="rounded bg-light d-flex align-items-center justify-content-center"
                                 style="width: 60px; height: 60px;">
                                <i class="fas fa-image text-muted"></i>
                            </div>
                        `}
                    </td>
                    <td>
                        <h6 class="mb-1">${post.title}</h6>
                        <small class="text-muted">${post.content.substring(0, 50)}...</small>
                    </td>
                    <td>
                        <span class="badge bg-${post.authorRole === 'admin' ? 'primary' : 'secondary'}">
                            ${post.authorName}
                        </span>
                    </td>
                    <td>${createdAt}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-primary" onclick="editPost('${doc.id}')" title="تعديل">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-info" onclick="viewPost('${doc.id}')" title="عرض">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deletePost('${doc.id}')" title="حذف">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading posts:', error);
        showAlert('حدث خطأ في تحميل المنشورات', 'danger');
    }
}

// تحميل صفحة المستخدمين
async function loadUsers() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        mainContent.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                        <h2 class="mb-0">إدارة المستخدمين</h2>
                        <button class="btn btn-primary" onclick="showAddUserModal()">
                            <i class="fas fa-plus-circle me-2"></i>إضافة مستخدم جديد
                        </button>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead class="table-light">
                                        <tr>
                                            <th>#</th>
                                            <th>الاسم</th>
                                            <th>البريد الإلكتروني</th>
                                            <th>الدور</th>
                                            <th>تاريخ التسجيل</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody id="usersTableBody">
                                        <!-- سيتم تعبئة المستخدمين هنا -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // جلب المستخدمين
        const usersSnapshot = await db.collection('users')
            .orderBy('createdAt', 'desc')
            .get();
        
        const usersTableBody = document.getElementById('usersTableBody');
        
        usersTableBody.innerHTML = usersSnapshot.docs.map((doc, index) => {
            const user = doc.data();
            const createdAt = formatDateTime(user.createdAt);

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${user.name || 'مستخدم'}</td>
                    <td>${user.email}</td>
                    <td>
                        <span class="badge bg-${user.role === 'admin' ? 'primary' : 'secondary'}">
                            ${user.role === 'admin' ? 'مشرف' : 'مستخدم'}
                        </span>
                    </td>
                    <td>${createdAt}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${doc.id}')" 
                                    ${user.role === 'admin' ? 'disabled' : ''} title="حذف">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('حدث خطأ في تحميل المستخدمين', 'danger');
    }
}

// دالة حذف مستخدم
async function deleteUser(userId) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
        return;
    }

    try {
        showLoadingScreen();
        
        // التحقق من أن المستخدم ليس مشرفاً
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        if (userData.role === 'admin') {
            showAlert('لا يمكن حذف حساب المشرف', 'warning');
            hideLoadingScreen();
            return;
        }

        await db.collection('users').doc(userId).delete();
        
        hideLoadingScreen();
        showAlert('تم حذف المستخدم بنجاح', 'success');
        loadUsers(); // إعادة تحميل قائمة المستخدمين
    } catch (error) {
        console.error('Error deleting user:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في حذف المستخدم', 'danger');
    }
}

// إضافة الدوال إلى النافذة
window.loadUsers = loadUsers;
window.deleteUser = deleteUser;

// دالة عرض مودال إضافة مستخدم جديد
function showAddUserModal() {
    const modalHtml = `
        <div class="modal fade" id="addUserModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">إضافة مستخدم جديد</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="addUserForm" onsubmit="addNewUser(event)">
                            <div class="mb-3">
                                <label class="form-label">الاسم</label>
                                <input type="text" class="form-control" id="userName" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">البريد الإلكتروني</label>
                                <input type="email" class="form-control" id="userEmail" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">كلمة المرور</label>
                                <input type="password" class="form-control" id="userPassword" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">الدور</label>
                                <select class="form-select" id="userRole">
                                    <option value="user">مستخدم</option>
                                    <option value="admin">مشرف</option>
                                </select>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                                <button type="submit" class="btn btn-primary">إضافة</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
    modal.show();
    
    document.getElementById('addUserModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// دالة إضافة مستخدم جديد
async function addNewUser(event) {
    event.preventDefault();
    
    const name = document.getElementById('userName').value;
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;

    try {
        showLoadingScreen();

        // إنشاء نسخة ثانوية من Firebase
        const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
        
        try {
            // إنشاء المستخدم في Firebase Auth باستخدام النسخة الثانوية
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // تحديث اسم المستخدم
            await user.updateProfile({
                displayName: name
            });

            // إضافة معلومات المستخدم إلى Firestore
            await db.collection('users').doc(user.uid).set({
                name,
                email,
                role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // حذف النسخة الثانوية
            await secondaryApp.delete();

            hideLoadingScreen();
            const modal = bootstrap.Modal.getInstance(document.getElementById('addUserModal'));
            modal.hide();
            showAlert('تم إضافة المستخدم بنجاح', 'success');
            
            // إعادة تحميل قائمة المستخدمين
            loadUsers();

        } catch (error) {
            // حذف النسخة الثانوية في حالة حدوث خطأ
            await secondaryApp.delete();
            throw error;
        }

    } catch (error) {
        console.error('Error adding user:', error);
        hideLoadingScreen();
        let errorMessage = 'حدث خطأ في إضافة المستخدم';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'البريد الإلكتروني مستخدم بالفعل';
        }
        
        showAlert(errorMessage, 'danger');
    }
}

// إضافة الدوال إلى النافذة
window.showAddUserModal = showAddUserModal;
window.addNewUser = addNewUser;

// دالة تحميل صفحة إرسال الإشعارات
async function loadNotifications() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    try {
        mainContent.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                        <h2 class="mb-0">إرسال إشعارات للمستخدمين</h2>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">إرسال إشعار جديد</h5>
                        </div>
                        <div class="card-body">
                            <form id="notificationForm" onsubmit="sendNotification(event)">
                                <div class="mb-3">
                                    <label class="form-label">نوع الإشعار</label>
                                    <select class="form-select" id="notificationType" required>
                                        <option value="all">جميع المستخدمين</option>
                                        <option value="specific">مستخدمين محددين</option>
                                    </select>
                                </div>
                                <div class="mb-3 d-none" id="usersSelectContainer">
                                    <label class="form-label">اختيار المستخدمين</label>
                                    <select class="form-select" id="selectedUsers" multiple>
                                        <!-- سيتم تعبئة المستخدمين هنا -->
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">عنوان الإشعار</label>
                                    <input type="text" class="form-control" id="notificationTitle" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">محتوى الإشعار</label>
                                    <textarea class="form-control" id="notificationContent" rows="4" required></textarea>
                                </div>
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-paper-plane me-2"></i>إرسال الإشعار
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">سجل الإشعارات</h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>العنوان</th>
                                            <th>التاريخ</th>
                                            <th>النوع</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody id="notificationsHistory">
                                        <!-- سيتم تعبئة سجل الإشعارات هنا -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // إضافة مستمع لتغيير نوع الإشعار
        const notificationType = document.getElementById('notificationType');
        const usersSelectContainer = document.getElementById('usersSelectContainer');
        const selectedUsers = document.getElementById('selectedUsers');

        if (notificationType) {
            notificationType.addEventListener('change', async function() {
                if (this.value === 'specific') {
                    usersSelectContainer.classList.remove('d-none');
                    // جلب قائمة المستخدمين
                    const usersSnapshot = await db.collection('users')
                        .where('role', '==', 'user')
                        .get();
                    selectedUsers.innerHTML = usersSnapshot.docs.map(doc => {
                        const userData = doc.data();
                        return `<option value="${doc.id}">${userData.name} (${userData.email})</option>`;
                    }).join('');
                } else {
                    usersSelectContainer.classList.add('d-none');
                }
            });
        }

        // تحميل سجل الإشعارات
        const notificationsSnapshot = await db.collection('notifications')
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();

        const notificationsHistory = document.getElementById('notificationsHistory');
        notificationsHistory.innerHTML = notificationsSnapshot.docs.map(doc => {
            const notification = doc.data();
            const createdAt = formatDateTime(notification.createdAt);
            return `
                <tr>
                    <td>${notification.title}</td>
                    <td>${createdAt}</td>
                    <td>
                        <span class="badge bg-${notification.type === 'all' ? 'primary' : 'info'}">
                            ${notification.type === 'all' ? 'الكل' : 'محدد'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteNotification('${doc.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading notifications page:', error);
        showAlert('حدث خطأ في تحميل صفحة الإشعارات', 'danger');
    }
}

// إضافة الدالة إلى النافذة
window.loadNotifications = loadNotifications;
