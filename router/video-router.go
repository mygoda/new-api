package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

func SetVideoRouter(router *gin.Engine) {
	// Video proxy: accepts either session auth (dashboard) or token auth (API clients)
	videoProxyRouter := router.Group("/v1")
	videoProxyRouter.Use(middleware.RouteTag("relay"))
	videoProxyRouter.Use(middleware.TokenOrUserAuth())
	{
		videoProxyRouter.GET("/videos/:task_id/content", controller.VideoProxy)
	}

	videoV1Router := router.Group("/v1")
	videoV1Router.Use(middleware.RouteTag("relay"))
	videoV1Router.Use(middleware.TokenAuth(), middleware.Distribute())
	{
		videoV1Router.POST("/video/generations", controller.RelayTask)
		videoV1Router.GET("/video/generations/:task_id", controller.RelayTaskFetch)
		videoV1Router.POST("/videos/:video_id/remix", controller.RelayTask)
	}
	// openai compatible API video routes
	// docs: https://platform.openai.com/docs/api-reference/videos/create
	{
		videoV1Router.POST("/videos", controller.RelayTask)
		videoV1Router.GET("/videos/:task_id", controller.RelayTaskFetch)
	}

	// Doubao 原生 v3 视频任务路径:
	//   POST /api/v3/contents/generations/tasks
	//   GET  /api/v3/contents/generations/tasks/:task_id
	// 与 /v1/video/generations 共用同一套 RelayTask / RelayTaskFetch 流水线，
	// 区别在于:
	//   1. POST 入口走 DoubaoV3RequestConvert 中间件,把 v3 原生 body
	//      ({model, content[], ratio, ...}) 包成 new-api 内部 TaskSubmitReq 形态,
	//      并校验 model 必须为 doubao-seedance-* 系列
	//   2. 响应体由 doubao TaskAdaptor.DoResponse / ConvertToDoubaoV3 输出火山原生格式,
	//      不做 OpenAI Video 包装
	doubaoV3Router := router.Group("/api/v3/contents/generations/tasks")
	doubaoV3Router.Use(middleware.RouteTag("relay"))
	{
		doubaoV3Router.POST("",
			middleware.DoubaoV3RequestConvert(),
			middleware.TokenAuth(),
			middleware.Distribute(),
			controller.RelayTask,
		)
		doubaoV3Router.GET("/:task_id",
			middleware.TokenAuth(),
			middleware.Distribute(),
			controller.RelayTaskFetch,
		)
	}

	klingV1Router := router.Group("/kling/v1")
	klingV1Router.Use(middleware.RouteTag("relay"))
	klingV1Router.Use(middleware.KlingRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	{
		klingV1Router.POST("/videos/text2video", controller.RelayTask)
		klingV1Router.POST("/videos/image2video", controller.RelayTask)
		klingV1Router.GET("/videos/text2video/:task_id", controller.RelayTaskFetch)
		klingV1Router.GET("/videos/image2video/:task_id", controller.RelayTaskFetch)
	}

	// Jimeng official API routes - direct mapping to official API format
	jimengOfficialGroup := router.Group("jimeng")
	jimengOfficialGroup.Use(middleware.RouteTag("relay"))
	jimengOfficialGroup.Use(middleware.JimengRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
	{
		// Maps to: /?Action=CVSync2AsyncSubmitTask&Version=2022-08-31 and /?Action=CVSync2AsyncGetResult&Version=2022-08-31
		jimengOfficialGroup.POST("/", controller.RelayTask)
	}
}
