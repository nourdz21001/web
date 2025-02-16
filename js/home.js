// استخدام Firebase من window.app
const auth = window.app.auth;
const db = window.app.db;

// المتغيرات العامة
let loginModal, registerModal;
let currentUser = null;

// وظائف الدردشة المباشرة
let currentChatId = null;
let chatUnsubscribe = null;

// عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    // تهيئة المودالات
    loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    registerModal = new bootstrap.Modal(document.getElementById('registerModal'));

    // إضافة مستمعي الأحداث
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    // إضافة مستمعي الأحداث للروابط
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('href').replace('#', '');
            loadSection(section);
            
            // تحديث الروابط النشطة
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // إضافة مستمعي الأحداث للروابط في القائمة المنسدلة
    const profileLink = document.querySelector('a[href="#profile"]');
    const settingsLink = document.querySelector('a[href="#settings"]');

    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            loadProfile();
        });
    }

    if (settingsLink) {
        settingsLink.addEventListener('click', function(e) {
            e.preventDefault();
            loadSettings();
        });
    }

    // مراقبة حالة تسجيل الدخول
    auth.onAuthStateChanged(handleAuthStateChange);

    // تحميل الصفحة الرئيسية افتراضياً
    loadSection('home');

    // إضافة مستمع لإخفاء نافذة الدردشة عند النقر خارجها
    document.addEventListener('click', function(event) {
        const chatWindow = document.getElementById('chatWindow');
        const chatIcon = document.getElementById('chatIcon');
        
        if (!chatWindow || !chatIcon) return;
        
        // تجاهل النقر داخل نافذة الدردشة أو على أيقونة الدردشة
        if (event.target.closest('#chatWindow') || event.target.closest('#chatIcon')) {
            return;
        }
        
        // إخفاء نافذة الدردشة وإظهار الأيقونة
        if (chatWindow.classList.contains('active')) {
            chatWindow.classList.remove('active');
            chatIcon.style.display = 'flex';
        }
    });
});

// معالجة تغيير حالة المصادقة
async function handleAuthStateChange(user) {
    const userDropdown = document.getElementById('userDropdown');
    const loginButton = document.getElementById('loginButton');
    const userDisplayName = document.getElementById('userDisplayName');

    if (user) {
        currentUser = user;
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.data();

        userDropdown.style.display = 'block';
        loginButton.style.display = 'none';
        userDisplayName.textContent = userData.name || 'مستخدم';

        // تحديث واجهة المستخدم
        updateUIForUser(userData);

        // إضافة أيقونة الإشعارات
        addNotificationIcon();
    } else {
        currentUser = null;
        userDropdown.style.display = 'none';
        loginButton.style.display = 'block';
        userDisplayName.textContent = 'تسجيل الدخول';

        // تحديث واجهة المستخدم للزوار
        updateUIForGuest();
    }
}

// تسجيل الدخول
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
        // تسجيل الدخول باستخدام Firebase Auth
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // التحقق من وجود وثيقة المستخدم في Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // إذا لم تكن هناك وثيقة للمستخدم، قم بإنشائها
            const userData = {
                name: user.displayName || 'مستخدم',
                email: user.email,
                role: 'user',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(user.uid).set(userData);
        }

        // تحديث المتغير العام
        currentUser = user;

        loginModal.hide();
        showAlert('تم تسجيل الدخول بنجاح', 'success');
        
        // تحميل الصفحة الرئيسية
        loadSection('home');
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = getAuthErrorMessage(error.code);
        errorDiv.classList.remove('d-none');
    }
}

// التسجيل
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const errorDiv = document.getElementById('registerError');

    try {
        // إنشاء المستخدم في Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // تحديث اسم العرض للمستخدم
        await user.updateProfile({
            displayName: name
        });
        
        // إضافة معلومات المستخدم إلى Firestore
        const userData = {
            name,
            email,
            role: 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(user.uid).set(userData);

        // تحديث المتغير العام
        currentUser = user;

        registerModal.hide();
        showAlert('تم إنشاء الحساب بنجاح', 'success');
        
        // تحميل الصفحة الرئيسية
        loadSection('home');
    } catch (error) {
        console.error('Register error:', error);
        errorDiv.textContent = getAuthErrorMessage(error.code);
        errorDiv.classList.remove('d-none');
    }
}

// تسجيل الخروج
async function handleLogout() {
    try {
        await auth.signOut();
        showAlert('تم تسجيل الخروج بنجاح', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('حدث خطأ أثناء تسجيل الخروج', 'danger');
    }
}

// تحميل المحتوى
async function loadSection(section) {
    const mainContent = document.getElementById('mainContent');
    const loadingScreen = document.getElementById('loadingScreen');
    
    try {
        if (loadingScreen) loadingScreen.classList.remove('d-none');

        switch(section) {
            case 'home':
                await loadHome();
                break;
            case 'posts':
                await loadPosts();
                break;
            case 'routines':
                await loadRoutines();
                break;
            case 'consultations':
                await loadConsultations();
                break;
            case 'profile':
                await loadProfile();
                break;
            case 'settings':
                await loadSettings();
                break;
            default:
                await loadHome();
        }
    } catch (error) {
        console.error('Error loading section:', error);
        showAlert('حدث خطأ في تحميل المحتوى', 'danger');
    } finally {
        if (loadingScreen) loadingScreen.classList.add('d-none');
    }
}

// تحميل الصفحة الرئيسية
async function loadHome() {
    const mainContent = document.getElementById('mainContent');
    
    try {
        // جلب آخر المنشورات والنصائح
        const [recentPosts, recentRoutines] = await Promise.all([
            db.collection('posts')
                .orderBy('createdAt', 'desc')
                .limit(3)
                .get(),
            db.collection('routines')
                .orderBy('createdAt', 'desc')
                .limit(3)
                .get()
        ]);

        mainContent.innerHTML = `
            <div class="row mb-5">
                <div class="col-md-6 offset-md-3 text-center">
                    <h1 class="display-4 mb-4">مرحباً بك في نور الجمال</h1>
                    <p class="lead">منصتك المتكاملة للعناية بالجمال والصحة</p>
                </div>
            </div>

            <!-- آخر المنشورات -->
            <section class="mb-5">
                <h2 class="mb-4">آخر المنشورات</h2>
                <div class="row">
                    ${recentPosts.docs.map(doc => {
                        const post = doc.data();
                        return `
                            <div class="col-md-4 mb-4">
                                <div class="card h-100">
                                    ${post.imageUrl ? `
                                        <img src="${post.imageUrl}" class="card-img-top" alt="صورة المنشور" style="height: 200px; object-fit: cover;">
                                    ` : ''}
                                    <div class="card-body">
                                        <h5 class="card-title">${post.title}</h5>
                                        <p class="card-text">${post.content.substring(0, 100)}...</p>
                                    </div>
                                    <div class="card-footer bg-transparent">
                                        <button class="btn btn-primary w-100" onclick="loadSection('posts')">
                                            قراءة المزيد
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>

            <!-- نصائح الروتين اليومي -->
            <section>
                <h2 class="mb-4">نصائح للروتين اليومي</h2>
                <div class="row">
                    ${recentRoutines.docs.map(doc => {
                        const routine = doc.data();
                        return `
                            <div class="col-md-4 mb-4">
                                <div class="card h-100">
                                    ${routine.imageUrl ? `
                                        <img src="${routine.imageUrl}" class="card-img-top" alt="صورة النصيحة" style="height: 200px; object-fit: cover;">
                                    ` : ''}
                                    <div class="card-body">
                                        <div class="d-flex justify-content-between align-items-start mb-2">
                                            <h5 class="card-title">${routine.title}</h5>
                                            <span class="badge bg-primary">${routine.time}</span>
                                        </div>
                                        <p class="card-text">${routine.description.substring(0, 100)}...</p>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    } catch (error) {
        console.error('Error loading home:', error);
        showAlert('حدث خطأ في تحميل الصفحة الرئيسية', 'danger');
    }
}

// تحديث دالة تنسيق التاريخ
function formatDate(timestamp) {
    if (!timestamp) return '';
    
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    };
    
    if (typeof timestamp === 'object' && timestamp.seconds) {
        timestamp = new Date(timestamp.seconds * 1000);
    }
    
    return new Date(timestamp).toLocaleDateString('fr-FR', options);
}

// تحديث دالة تنسيق الوقت
function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const options = { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false // استخدام نظام 24 ساعة
    };
    
    if (typeof timestamp === 'object' && timestamp.seconds) {
        timestamp = new Date(timestamp.seconds * 1000);
    }
    
    return new Date(timestamp).toLocaleTimeString('fr-FR', options);
}

// تحميل المنشورات
async function loadPosts() {
    const mainContent = document.getElementById('mainContent');
    
    try {
        const postsSnapshot = await db.collection('posts')
            .orderBy('createdAt', 'desc')
            .get();

        mainContent.innerHTML = `
            <div class="container">
                <div class="row justify-content-center">
                    <div class="col-lg-8">
                        <!-- زر إضافة منشور جديد -->
                        ${currentUser ? `
                            <div class="card mb-4">
                                <div class="card-body">
                                    <div class="d-flex align-items-center" onclick="showNewPostModal()" style="cursor: pointer;">
                                        <div class="user-avatar me-3">
                                            <i class="fas fa-user"></i>
                                        </div>
                                        <div class="flex-grow-1">
                                            <div class="form-control text-muted" style="cursor: pointer;">
                                                ماذا تريد أن تشارك اليوم؟
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <!-- نموذج إضافة منشور جديد -->
                        <div class="modal fade" id="newPostModal" tabindex="-1">
                            <div class="modal-dialog modal-lg">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title">إنشاء منشور جديد</h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                    </div>
                                    <div class="modal-body">
                                        <form id="newPostForm">
                                            <div class="mb-3">
                                                <label class="form-label">عنوان المنشور</label>
                                                <input type="text" class="form-control" id="newPostTitle" required>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">محتوى المنشور</label>
                                                <textarea class="form-control" id="newPostContent" rows="4" required></textarea>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">إضافة صورة</label>
                                                <input type="file" class="form-control" id="newPostImage" accept="image/*" onchange="handleNewPostImageUpload(event)">
                                                <div id="newPostImagePreview" class="mt-2 d-none">
                                                    <img src="" alt="معاينة الصورة" class="img-fluid rounded" style="max-height: 200px">
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                                        <button type="button" class="btn btn-primary" onclick="createNewPost()">نشر</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- عرض المنشورات -->
                        ${postsSnapshot.docs.map(doc => {
                            const post = doc.data();
                            const createdAt = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString('fr-FR', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            }) : '';
                            const createdTime = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                            }) : '';
                            
                            return `
                                <div class="card mb-4 post-card">
                                    <!-- رأس المنشور -->
                                    <div class="card-header bg-white border-0 py-3">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div class="d-flex align-items-center">
                                                <div class="user-avatar ${post.authorRole === 'admin' ? 'admin-avatar' : ''}">
                                                    <i class="fas fa-user"></i>
                                                </div>
                                                <div class="me-3">
                                                    <h6 class="mb-0 fw-bold">
                                                        ${post.authorName}
                                                        ${post.authorRole === 'admin' ? '<span class="badge bg-primary ms-2">مشرف</span>' : ''}
                                                    </h6>
                                                    <small class="text-muted">
                                                        ${formatDate(post.createdAt)} - ${formatTime(post.createdAt)}
                                                    </small>
                                                </div>
                                            </div>
                                            ${(currentUser && (post.authorId === currentUser.uid || currentUser.role === 'admin')) ? `
                                                <div class="dropdown">
                                                    <button class="btn btn-link text-muted" data-bs-toggle="dropdown">
                                                        <i class="fas fa-ellipsis-v"></i>
                                                    </button>
                                                    <ul class="dropdown-menu dropdown-menu-end">
                                                        <li>
                                                            <button class="dropdown-item" onclick="editPost('${doc.id}')">
                                                                <i class="fas fa-edit me-2"></i>تعديل
                                                            </button>
                                                        </li>
                                                        <li>
                                                            <button class="dropdown-item text-danger" onclick="deletePost('${doc.id}')">
                                                                <i class="fas fa-trash-alt me-2"></i>حذف
                                                            </button>
                                                        </li>
                                                    </ul>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>

                                    <!-- محتوى المنشور -->
                                    <div class="card-body">
                                        <h5 class="card-title mb-3">${post.title}</h5>
                                        <p class="card-text">${post.content}</p>
                                    </div>

                                    ${post.imageUrl ? `
                                        <div class="post-image-container">
                                            <img src="${post.imageUrl}" class="img-fluid w-100" alt="صورة المنشور" style="max-height: 500px; object-fit: contain;">
                                        </div>
                                    ` : ''}

                                    <!-- تفاعلات المنشور -->
                                    <div class="card-footer bg-white">
                                        <div class="d-flex justify-content-between align-items-center mb-3">
                                            <div>
                                                <span class="text-muted">
                                                    <i class="fas fa-heart text-danger"></i>
                                                    ${post.likes ? post.likes.length : 0} إعجاب
                                                </span>
                                                <span class="text-muted ms-3">
                                                    <i class="fas fa-comment text-primary"></i>
                                                    ${post.comments ? Object.keys(post.comments).length : 0} تعليق
                                                </span>
                                            </div>
                                        </div>

                                        <div class="d-flex gap-2 border-top border-bottom py-2">
                                            <button class="btn btn-light flex-fill" onclick="toggleLike('${doc.id}')">
                                                <i class="fas fa-heart${post.likes && post.likes.includes(currentUser?.uid) ? ' text-danger' : ''}"></i>
                                                إعجاب
                                            </button>
                                            <button class="btn btn-light flex-fill" onclick="toggleComments('${doc.id}')">
                                                <i class="fas fa-comment"></i>
                                                تعليق
                                            </button>
                                        </div>

                                        <!-- قسم التعليقات -->
                                        <div class="comments-section-${doc.id} mt-3" style="display: none;">
                                            <div class="comments-list-${doc.id}">
                                                ${post.comments ? Object.entries(post.comments).map(([commentId, comment]) => `
                                                    <div class="d-flex mb-3">
                                                        <div class="user-avatar small-avatar ${comment.authorRole === 'admin' ? 'admin-avatar' : ''}">
                                                            <i class="fas fa-user"></i>
                                                        </div>
                                                        <div class="me-2 flex-grow-1">
                                                            <div class="bg-light p-2 rounded">
                                                                <h6 class="mb-1 fw-bold">
                                                                    ${comment.authorName}
                                                                    ${comment.authorRole === 'admin' ? '<span class="badge bg-primary ms-2">مشرف</span>' : ''}
                                                                </h6>
                                                                <p class="mb-1">${comment.content}</p>
                                                                <small class="text-muted">
                                                                    ${formatDate(comment.createdAt)}
                                                                </small>
                                                            </div>
                                                        </div>
                                                    </div>
                                                `).join('') : ''}
                                            </div>
                                            ${currentUser ? `
                                                <div class="d-flex mt-3">
                                                    <div class="user-avatar small-avatar">
                                                        <i class="fas fa-user"></i>
                                                    </div>
                                                    <div class="flex-grow-1 me-2">
                                                        <div class="input-group">
                                                            <input type="text" class="form-control rounded-pill comment-input-${doc.id}" 
                                                                placeholder="اكتب تعليقاً...">
                                                            <button class="btn btn-primary rounded-circle ms-2" onclick="addComment('${doc.id}')">
                                                                <i class="fas fa-paper-plane"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ` : `
                                                <div class="text-center mt-3">
                                                    <button class="btn btn-outline-primary rounded-pill" onclick="showLoginModal()">
                                                        <i class="fas fa-sign-in-alt me-2"></i>
                                                        سجل دخولك للتعليق
                                                    </button>
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;

        // إضافة الوظائف الجديدة
        window.showNewPostModal = function() {
            const modal = new bootstrap.Modal(document.getElementById('newPostModal'));
            modal.show();
        };

        window.handleNewPostImageUpload = async function(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                showLoadingScreen();
                const imageInfo = await window.app.uploadImage(file);
                window.app.currentImageURL = imageInfo.url;
                
                const imagePreview = document.getElementById('newPostImagePreview');
                const previewImg = imagePreview.querySelector('img');
                previewImg.src = imageInfo.url;
                imagePreview.classList.remove('d-none');
                
                hideLoadingScreen();
                showAlert('تم رفع الصورة بنجاح', 'success');
            } catch (error) {
                console.error('Error uploading image:', error);
                hideLoadingScreen();
                showAlert('حدث خطأ في رفع الصورة', 'danger');
            }
        };

        window.createNewPost = async function() {
            const title = document.getElementById('newPostTitle').value;
            const content = document.getElementById('newPostContent').value;
            const imageUrl = window.app.currentImageURL;

            if (!title || !content) {
                showAlert('يرجى ملء جميع الحقول المطلوبة', 'danger');
                return;
            }

            try {
                showLoadingScreen();
                
                // إضافة شريط التحميل للمودال
                const modalBody = document.querySelector('.modal-body');
                modalBody.insertAdjacentHTML('afterbegin', `
                    <div class="progress mb-3" style="height: 3px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             role="progressbar" 
                             style="width: 0%" 
                             aria-valuenow="0" 
                             aria-valuemin="0" 
                             aria-valuemax="100">
                        </div>
                    </div>
                `);

                showProgress(30); // بداية التحميل

                const user = auth.currentUser;
                if (!user) {
                    showAlert('يجب تسجيل الدخول أولاً', 'danger');
                    return;
                }

                showProgress(50); // جاري جلب بيانات المستخدم

                const userDoc = await db.collection('users').doc(user.uid).get();
                
                showProgress(70); // جاري إنشاء المنشور

                await db.collection('posts').add({
                    title,
                    content,
                    imageUrl,
                    authorId: user.uid,
                    authorName: userDoc.data().name || 'مستخدم',
                    authorRole: userDoc.data().role || 'user',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    likes: [],
                    comments: {}
                });

                showProgress(90); // اكتمل إنشاء المنشور

                // إعادة تعيين النموذج
                document.getElementById('newPostTitle').value = '';
                document.getElementById('newPostContent').value = '';
                document.getElementById('newPostImage').value = '';
                document.getElementById('newPostImagePreview').classList.add('d-none');
                window.app.currentImageURL = null;

                showProgress(100); // اكتمل التحميل

                hideLoadingScreen();
                const modal = bootstrap.Modal.getInstance(document.getElementById('newPostModal'));
                modal.hide();
                showAlert('تم نشر المنشور بنجاح', 'success');
                
                // إعادة تحميل المنشورات بعد إضافة المنشور الجديد
                setTimeout(() => {
                    loadPosts();
                }, 500);

            } catch (error) {
                console.error('Error creating post:', error);
                hideLoadingScreen();
                showAlert('حدث خطأ في نشر المنشور', 'danger');
            } finally {
                // إزالة شريط التحميل
                const progressBar = document.querySelector('.progress');
                if (progressBar) {
                    progressBar.remove();
                }
            }
        };

        // إضافة الأنماط المخصصة للمنشورات
        const style = document.createElement('style');
        style.textContent = `
            .post-card {
                border-radius: 15px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transition: transform 0.2s;
                overflow: hidden;
            }
            .user-avatar {
                width: 45px;
                height: 45px;
                background-color: #e9ecef;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #6c757d;
            }
            .small-avatar {
                width: 35px;
                height: 35px;
            }
            .admin-avatar {
                background-color: var(--primary-color);
                color: white;
            }
            .post-image-container {
                margin: 0;
                background-color: #f8f9fa;
                text-align: center;
                padding: 10px;
            }
            .post-image-container img {
                max-height: 500px;
                width: auto;
                max-width: 100%;
                object-fit: contain;
            }
            .btn-light:hover {
                background-color: #e9ecef;
            }
        `;
        document.head.appendChild(style);

    } catch (error) {
        console.error('Error loading posts:', error);
        showAlert('حدث خطأ في تحميل المنشورات', 'danger');
    }
}

// تحميل الروتين اليومي
async function loadRoutines() {
    const mainContent = document.getElementById('mainContent');
    
    try {
        const routinesSnapshot = await db.collection('routines')
            .orderBy('time', 'asc')
            .get();

        mainContent.innerHTML = `
            <h2 class="mb-4">الروتين اليومي</h2>
            <div class="row">
                ${routinesSnapshot.docs.map(doc => {
                    const routine = doc.data();
                    return `
                        <div class="col-md-4 mb-4">
                            <div class="card h-100">
                                ${routine.imageUrl ? `
                                    <img src="${routine.imageUrl}" class="card-img-top" alt="صورة النصيحة" style="height: 200px; object-fit: cover;">
                                ` : ''}
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <h5 class="card-title">${routine.title}</h5>
                                        <span class="badge bg-primary">${routine.time}</span>
                                    </div>
                                    <p class="card-text">${routine.description}</p>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading routines:', error);
        showAlert('حدث خطأ في تحميل الروتين اليومي', 'danger');
    }
}

// تحميل الاستشارات
async function loadConsultations() {
    const mainContent = document.getElementById('mainContent');
    
    if (!currentUser) {
        mainContent.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-lock fa-3x mb-3 text-muted"></i>
                <h3>يجب تسجيل الدخول للوصول إلى الاستشارات</h3>
                <button class="btn btn-primary mt-3" onclick="showLoginModal()">
                    تسجيل الدخول
                </button>
            </div>
        `;
        return;
    }

    try {
        // جلب محادثات المستخدم
        const chatDoc = await db.collection('consultations')
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();

        let chatId;
        if (chatDoc.empty) {
            // إنشاء محادثة جديدة
            const newChatRef = await db.collection('consultations').add({
                userId: currentUser.uid,
                userName: currentUser.displayName || 'مستخدم',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: '',
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                unreadCount: 0
            });
            chatId = newChatRef.id;
        } else {
            chatId = chatDoc.docs[0].id;
        }

        mainContent.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h5 class="card-title mb-0">المحادثة مع المشرف</h5>
                </div>
                <div class="card-body p-0">
                    <div id="chatMessages" class="chat-messages">
                        <!-- سيتم تحميل الرسائل هنا -->
                    </div>
                    <div class="p-3 border-top">
                        <form id="chatForm" data-chat-id="${chatId}">
                            <div class="input-group">
                                <input type="text" class="form-control" id="messageInput" placeholder="اكتب رسالتك هنا...">
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // إضافة مستمع للرسائل
        const chatMessages = document.getElementById('chatMessages');
        const unsubscribe = db.collection('consultations').doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                chatMessages.innerHTML = '';
                
                snapshot.forEach((doc) => {
                    const message = doc.data();
                    const messageTime = message.timestamp ? new Date(message.timestamp.seconds * 1000).toLocaleTimeString('fr-FR') : '';
                    
                    chatMessages.innerHTML += `
                        <div class="chat-message ${message.isAdmin ? 'admin' : 'user'}">
                            <div class="message-content">
                                <h6 class="mb-0">${message.senderName}</h6>
                                <p>${message.content}</p>
                                <small class="text-muted">${messageTime}</small>
                            </div>
                        </div>
                    `;
                });

                chatMessages.scrollTop = chatMessages.scrollHeight;
            });

        // إضافة مستمع لنموذج الدردشة
        const chatForm = document.getElementById('chatForm');
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageInput = document.getElementById('messageInput');
            const message = messageInput.value.trim();
            if (!message) return;

            try {
                // إضافة الرسالة
                await db.collection('consultations').doc(chatId)
                    .collection('messages').add({
                        content: message,
                        senderId: currentUser.uid,
                        senderName: currentUser.displayName || 'مستخدم',
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        isAdmin: false
                    });

                // تحديث آخر رسالة
                await db.collection('consultations').doc(chatId).update({
                    lastMessage: message,
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
                });

                messageInput.value = '';
            } catch (error) {
                console.error('Error sending message:', error);
                showAlert('حدث خطأ في إرسال الرسالة', 'danger');
            }
        });

        // تخزين مرجع إلغاء الاشتراك
        window.currentChatUnsubscribe = unsubscribe;
    } catch (error) {
        console.error('Error loading consultations:', error);
        showAlert('حدث خطأ في تحميل الاستشارات', 'danger');
    }
}

// تحميل الملف الشخصي
async function loadProfile() {
    const mainContent = document.getElementById('mainContent');
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
                            <form id="profileForm" onsubmit="updateProfile(event)">
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
    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('حدث خطأ في تحميل الملف الشخصي', 'danger');
    }
}

// إضافة دالة loadSettings
async function loadSettings() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-header">
                        <h5 class="card-title mb-0">تغيير كلمة المرور</h5>
                    </div>
                    <div class="card-body">
                        <form id="changePasswordForm" onsubmit="changePassword(event)">
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
                        <form id="notificationSettingsForm" onsubmit="updateNotificationSettings(event)">
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

    // تحميل إعدادات الإشعارات الحالية
    loadNotificationSettings();
}

// إضافة الدوال المساعدة
window.loadProfile = loadProfile;
window.loadSettings = loadSettings;
window.updateProfileImage = updateProfileImage;
window.updateProfile = updateProfile;
window.changePassword = changePassword;
window.updateNotificationSettings = updateNotificationSettings;

// وظائف مساعدة
function showLoginModal() {
    registerModal.hide();
    loginModal.show();
}

function showRegisterModal() {
    loginModal.hide();
    registerModal.show();
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function getAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/user-not-found':
            return 'البريد الإلكتروني غير مسجل';
        case 'auth/wrong-password':
            return 'كلمة المرور غير صحيحة';
        case 'auth/invalid-email':
            return 'البريد الإلكتروني غير صالح';
        case 'auth/email-already-in-use':
            return 'البريد الإلكتروني مستخدم بالفعل';
        case 'auth/weak-password':
            return 'كلمة المرور ضعيفة جداً. يجب أن تكون على الأقل 6 أحرف';
        case 'auth/operation-not-allowed':
            return 'تسجيل الدخول بالبريد الإلكتروني وكلمة المرور غير مفعل';
        case 'auth/too-many-requests':
            return 'تم تجاوز عدد المحاولات المسموح بها. الرجاء المحاولة لاحقاً';
        case 'auth/network-request-failed':
            return 'حدث خطأ في الاتصال بالشبكة';
        case 'auth/invalid-login-credentials':
            return 'بيانات تسجيل الدخول غير صحيحة';
        default:
            return 'حدث خطأ غير متوقع: ' + errorCode;
    }
}

// وظائف التفاعل مع المنشورات
async function toggleLike(postId) {
    if (!currentUser) {
        showLoginModal();
        return;
    }

    try {
        const postRef = db.collection('posts').doc(postId);
        const post = await postRef.get();
        
        let likes = post.data().likes || [];
        if (likes.includes(currentUser.uid)) {
            likes = likes.filter(id => id !== currentUser.uid);
        } else {
            likes.push(currentUser.uid);
        }
        
        await postRef.update({ likes });
        loadPosts();
    } catch (error) {
        console.error('Error toggling like:', error);
        showAlert('حدث خطأ في تسجيل الإعجاب', 'danger');
    }
}

function toggleComments(postId) {
    const commentsSection = document.querySelector(`.comments-section-${postId}`);
    commentsSection.style.display = commentsSection.style.display === 'none' ? 'block' : 'none';
}

async function addComment(postId) {
    if (!currentUser) {
        showLoginModal();
        return;
    }

    const commentInput = document.querySelector(`.comment-input-${postId}`);
    const content = commentInput.value.trim();
    
    if (!content) return;

    try {
        const user = auth.currentUser;
        const userDoc = await db.collection('users').doc(user.uid).get();
        const postRef = db.collection('posts').doc(postId);
        
        const commentId = Date.now().toString();
        const comment = {
            [commentId]: {
                content,
                authorId: user.uid,
                authorName: userDoc.data().name || 'مستخدم',
                authorRole: userDoc.data().role || 'user',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        };

        await postRef.update({
            [`comments.${commentId}`]: comment[commentId]
        });

        commentInput.value = '';
        loadPosts();
    } catch (error) {
        console.error('Error adding comment:', error);
        showAlert('حدث خطأ في إضافة التعليق', 'danger');
    }
}

// تحديث واجهة المستخدم
function updateUIForUser(userData) {
    const loginButton = document.getElementById('loginButton');
    const userDropdown = document.getElementById('userDropdown');
    
    loginButton.style.display = 'none';
    userDropdown.style.display = 'block';
}

function updateUIForGuest() {
    const loginButton = document.getElementById('loginButton');
    const userDropdown = document.getElementById('userDropdown');
    
    loginButton.style.display = 'block';
    userDropdown.style.display = 'none';
}

// تعديل وظيفة toggleChatWindow
window.toggleChatWindow = function(event) {
    if (event) {
        event.stopPropagation();
    }
    
    const chatWindow = document.getElementById('chatWindow');
    const chatIcon = document.getElementById('chatIcon');
    
    if (!currentUser) {
        showLoginModal();
        return;
    }

    const isActive = chatWindow.classList.toggle('active');
    
    if (isActive) {
        chatIcon.style.display = 'none';
        initializeChat();
    } else {
        chatIcon.style.display = 'flex';
    }
}

async function initializeChat() {
    try {
        // التحقق من وجود محادثة سابقة
        const chatDoc = await db.collection('consultations')
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();

        if (chatDoc.empty) {
            // إنشاء محادثة جديدة
            const newChatRef = await db.collection('consultations').add({
                userId: currentUser.uid,
                userName: currentUser.displayName || 'مستخدم',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessage: '',
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                unreadCount: 0
            });
            currentChatId = newChatRef.id;
        } else {
            currentChatId = chatDoc.docs[0].id;
        }

        // الاشتراك في تحديثات الرسائل
        if (chatUnsubscribe) {
            chatUnsubscribe();
        }

        const chatIcon = document.getElementById('chatIcon');
        const chatWindow = document.getElementById('chatWindow');

        // إضافة عنصر الإشعار إذا لم يكن موجوداً
        let notificationBadge = chatIcon.querySelector('.chat-notification');
        if (!notificationBadge) {
            notificationBadge = document.createElement('div');
            notificationBadge.className = 'chat-notification';
            notificationBadge.style.display = 'none';
            chatIcon.appendChild(notificationBadge);
        }

        chatUnsubscribe = db.collection('consultations').doc(currentChatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                const chatBody = document.getElementById('chatBody');
                let messages = [];
                let newMessages = false;
                
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const message = change.doc.data();
                        // التحقق مما إذا كانت الرسالة جديدة وليست من المستخدم الحالي
                        if (message.senderId !== currentUser.uid && 
                            message.timestamp && 
                            new Date(message.timestamp.seconds * 1000) > new Date(Date.now() - 1000)) {
                            newMessages = true;
                        }
                    }
                });

                // تحديث عداد الرسائل غير المقروءة
                if (newMessages && !chatWindow.classList.contains('active')) {
                    const currentCount = parseInt(notificationBadge.textContent) || 0;
                    notificationBadge.textContent = currentCount + 1;
                    notificationBadge.style.display = 'flex';
                    
                    // إضافة صوت التنبيه
                    const notification = new Audio('/assets/notification.mp3');
                    notification.play().catch(e => console.log('Audio play failed:', e));
                }

                snapshot.forEach((doc) => {
                    const message = doc.data();
                    const messageTime = message.timestamp ? new Date(message.timestamp.seconds * 1000).toLocaleTimeString('fr-FR') : '';
                    
                    messages.push(`
                        <div class="chat-message ${message.isAdmin ? 'admin' : 'user'}">
                            <div class="message-content">
                                <h6 class="mb-0">${message.senderName}</h6>
                                <p class="mb-0">${message.content}</p>
                                <small class="text-muted">${messageTime}</small>
                            </div>
                        </div>
                    `);
                });

                chatBody.innerHTML = messages.join('');
                
                // تمرير إلى أسفل الدردشة عند إضافة رسالة جديدة
                chatBody.scrollTop = chatBody.scrollHeight;
            });

        // إعادة تعيين عداد الإشعارات عند فتح نافذة الدردشة
        chatIcon.addEventListener('click', () => {
            notificationBadge.textContent = '0';
            notificationBadge.style.display = 'none';
        });

    } catch (error) {
        console.error('Error initializing chat:', error);
        showAlert('حدث خطأ في تهيئة الدردشة', 'danger');
    }
}

async function sendLiveMessage(event) {
    event.preventDefault();
    
    if (!currentUser || !currentChatId) {
        showLoginModal();
        return;
    }

    const messageInput = document.getElementById('liveChatInput');
    const message = messageInput.value.trim();
    
    if (!message) return;

    try {
        // إضافة الرسالة
        await db.collection('consultations').doc(currentChatId)
            .collection('messages').add({
                content: message,
                senderId: currentUser.uid,
                senderName: currentUser.displayName || 'مستخدم',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                isAdmin: false
            });

        // تحديث آخر رسالة في المحادثة
        await db.collection('consultations').doc(currentChatId).update({
            lastMessage: message,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
        });

        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('حدث خطأ في إرسال الرسالة', 'danger');
    }
}

// إضافة دالة لعرض شريط التحميل
function showProgress(progress) {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
    }
}

// تحديث دالة showLoadingScreen لتكون أكثر وضوحاً
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.remove('d-none');
        loadingScreen.style.display = 'flex';
        loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        loadingScreen.style.zIndex = '9999';
    }
}

// تحديث دالة hideLoadingScreen
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('d-none');
    }
}

// إضافة دوال التعديل والحذف
window.editPost = async function(postId) {
    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        const post = postDoc.data();
        
        // إنشاء مودال التعديل
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
                                    <input type="file" class="form-control" id="editPostImage" accept="image/*" onchange="handleEditImageUpload(event)">
                                    <div id="editImagePreview" class="mt-2 d-none">
                                        <img src="" alt="معاينة الصورة" class="img-fluid rounded" style="max-height: 200px">
                                    </div>
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
        
        // تهيئة المودال وعرضه
        const modal = new bootstrap.Modal(document.getElementById('editPostModal'));
        modal.show();
        
        // حذف المودال عند إغلاقه
        document.getElementById('editPostModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
        
    } catch (error) {
        console.error('Error loading post for edit:', error);
        showAlert('حدث خطأ في تحميل المنشور', 'danger');
    }
};

window.handleEditImageUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        showLoadingScreen();
        const imageInfo = await window.app.uploadImage(file);
        window.app.currentImageURL = imageInfo.url;
        
        const imagePreview = document.getElementById('editImagePreview');
        const previewImg = imagePreview.querySelector('img');
        previewImg.src = imageInfo.url;
        imagePreview.classList.remove('d-none');
        
        hideLoadingScreen();
        showAlert('تم رفع الصورة بنجاح', 'success');
    } catch (error) {
        console.error('Error uploading image:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في رفع الصورة', 'danger');
    }
};

window.updatePost = async function(postId) {
    const title = document.getElementById('editPostTitle').value;
    const content = document.getElementById('editPostContent').value;
    const newImageUrl = window.app.currentImageURL;

    if (!title || !content) {
        showAlert('يرجى ملء جميع الحقول المطلوبة', 'danger');
        return;
    }

    try {
        showLoadingScreen();
        
        const postRef = db.collection('posts').doc(postId);
        const postDoc = await postRef.get();
        const currentPost = postDoc.data();

        await postRef.update({
            title,
            content,
            imageUrl: newImageUrl || currentPost.imageUrl,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        hideLoadingScreen();
        const modal = bootstrap.Modal.getInstance(document.getElementById('editPostModal'));
        modal.hide();
        showAlert('تم تحديث المنشور بنجاح', 'success');
        loadPosts();
    } catch (error) {
        console.error('Error updating post:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في تحديث المنشور', 'danger');
    }
};

window.deletePost = async function(postId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) {
        return;
    }

    try {
        showLoadingScreen();
        await db.collection('posts').doc(postId).delete();
        hideLoadingScreen();
        showAlert('تم حذف المنشور بنجاح', 'success');
        loadPosts();
    } catch (error) {
        console.error('Error deleting post:', error);
        hideLoadingScreen();
        showAlert('حدث خطأ في حذف المنشور', 'danger');
    }
};

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
async function updateProfile(event) {
    event.preventDefault();
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

// دالة تغيير كلمة المرور
async function changePassword(event) {
    event.preventDefault();
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
        let errorMessage = 'حدث خطأ في تغيير كلمة المرور';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'كلمة المرور الحالية غير صحيحة';
        }
        showAlert(errorMessage, 'danger');
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
async function updateNotificationSettings(event) {
    event.preventDefault();
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

// إضافة أيقونة الإشعارات في القائمة العلوية
function addNotificationIcon() {
    const navbarNav = document.querySelector('.navbar-nav');
    if (!navbarNav) return;

    const notificationItem = document.createElement('li');
    notificationItem.className = 'nav-item dropdown';
    notificationItem.innerHTML = `
        <a class="nav-link" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="fas fa-bell"></i>
            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none" id="notificationBadge">
                0
            </span>
        </a>
        <div class="dropdown-menu dropdown-menu-end notification-dropdown" style="width: 300px; max-height: 400px; overflow-y: auto;">
            <div class="p-2" id="notificationsContainer">
                <div class="text-center text-muted">جاري تحميل الإشعارات...</div>
            </div>
        </div>
    `;

    navbarNav.appendChild(notificationItem);

    // بدء مراقبة الإشعارات
    startNotificationsListener();
}

// مراقبة الإشعارات
function startNotificationsListener() {
    if (!auth.currentUser) return;

    const notificationsContainer = document.getElementById('notificationsContainer');
    const notificationBadge = document.getElementById('notificationBadge');

    db.collection('users').doc(auth.currentUser.uid)
        .collection('notifications')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            const unreadCount = snapshot.docs.filter(doc => !doc.data().read).length;
            
            if (unreadCount > 0) {
                notificationBadge.textContent = unreadCount;
                notificationBadge.classList.remove('d-none');
            } else {
                notificationBadge.classList.add('d-none');
            }

            if (snapshot.empty) {
                notificationsContainer.innerHTML = `
                    <div class="text-center text-muted">لا توجد إشعارات</div>
                `;
                return;
            }

            notificationsContainer.innerHTML = snapshot.docs.map(doc => {
                const notification = doc.data();
                const createdAt = notification.createdAt ? new Date(notification.createdAt.seconds * 1000)
                    .toLocaleString('fr-FR') : '';

                return `
                    <div class="dropdown-item notification-item ${!notification.read ? 'unread' : ''}" 
                         onclick="markNotificationAsRead('${doc.id}')">
                        <h6 class="mb-1">${notification.title}</h6>
                        <p class="mb-1 small">${notification.content}</p>
                        <small class="text-muted">${createdAt}</small>
                    </div>
                    <div class="dropdown-divider"></div>
                `;
            }).join('');
        });
}

// تحديد الإشعار كمقروء
async function markNotificationAsRead(notificationId) {
    try {
        await db.collection('users').doc(auth.currentUser.uid)
            .collection('notifications').doc(notificationId)
            .update({
                read: true
            });
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

// إضافة الأنماط للإشعارات
const notificationStyles = `
    .notification-dropdown {
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }
    .notification-item {
        padding: 0.75rem 1rem;
        cursor: pointer;
        transition: background-color 0.3s;
    }
    .notification-item:hover {
        background-color: #f8f9fa;
    }
    .notification-item.unread {
        background-color: #e3f2fd;
    }
    .notification-item.unread:hover {
        background-color: #d1e9fc;
    }
`;

// إضافة الأنماط للصفحة
const styleElement = document.createElement('style');
styleElement.textContent = notificationStyles;
document.head.appendChild(styleElement); 